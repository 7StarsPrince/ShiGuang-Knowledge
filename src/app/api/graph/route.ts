import { NextResponse } from 'next/server';
import getDb from '@/lib/db';

export const dynamic = 'force-dynamic';

interface GraphNode {
  id: string;
  name: string;
  type: 'article' | 'speech' | 'paper' | 'tag' | 'topic' | 'topic-root' | 'entity';
  val: number;
  entityType?: string;
}

interface GraphLink {
  source: string;
  target: string;
}

export async function GET() {
  const db = getDb();

  // Fetch content with tags, topic, AND AI-extracted data
  const articles = db.prepare(`
    SELECT a.id, a.title, a.topic_id, a.ai_keywords, a.ai_entities, GROUP_CONCAT(t.name) as tags
    FROM articles a
    LEFT JOIN article_tags at ON a.id = at.article_id
    LEFT JOIN tags t ON at.tag_id = t.id
    GROUP BY a.id
  `).all() as { id: number; title: string; topic_id: number | null; tags: string | null; ai_keywords: string | null; ai_entities: string | null }[];

  const speeches = db.prepare(`
    SELECT s.id, s.title, s.topic_id, s.ai_keywords, s.ai_entities, GROUP_CONCAT(t.name) as tags
    FROM speeches s
    LEFT JOIN speech_tags st ON s.id = st.speech_id
    LEFT JOIN tags t ON st.tag_id = t.id
    GROUP BY s.id
  `).all() as { id: number; title: string; topic_id: number | null; tags: string | null; ai_keywords: string | null; ai_entities: string | null }[];

  const papers = db.prepare(`
    SELECT p.id, p.title, p.topic_id, p.ai_keywords, p.ai_entities, GROUP_CONCAT(t.name) as tags
    FROM academic_papers p
    LEFT JOIN paper_tags pt ON p.id = pt.paper_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    GROUP BY p.id
  `).all() as { id: number; title: string; topic_id: number | null; tags: string | null; ai_keywords: string | null; ai_entities: string | null }[];

  // Fetch topics with parent hierarchy
  const topics = db.prepare(`SELECT id, name, parent_id FROM topics`).all() as { id: number; name: string; parent_id: number | null }[];

  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const nodeIds = new Set<string>();

  const addNode = (node: GraphNode) => {
    if (!nodeIds.has(node.id)) {
      nodeIds.add(node.id);
      nodes.push(node);
    }
  };

  // 1) Add topic nodes + parent↔child links
  for (const topic of topics) {
    const isRoot = !topic.parent_id;
    addNode({ id: `topic:${topic.id}`, name: topic.name, type: isRoot ? 'topic-root' : 'topic', val: isRoot ? 7 : 5 });
    if (topic.parent_id) {
      links.push({ source: `topic:${topic.parent_id}`, target: `topic:${topic.id}` });
    }
  }

  // 2) Add tag→content tracking for direct links
  const tagToContent = new Map<string, string[]>();
  const topicTags = new Map<number, Set<string>>();
  const entityToContent = new Map<string, string[]>();

  const addItems = (
    items: { id: number; title: string; topic_id: number | null; tags: string | null; ai_keywords: string | null; ai_entities: string | null }[],
    type: 'article' | 'speech' | 'paper'
  ) => {
    for (const item of items) {
      const nodeId = `${type}-${item.id}`;
      addNode({ id: nodeId, name: item.title, type, val: 4 });

      // Content → Topic
      if (item.topic_id) {
        links.push({ source: nodeId, target: `topic:${item.topic_id}` });
      }

      // Content → Tag (manual tags)
      if (item.tags) {
        for (const tag of item.tags.split(',')) {
          const trimmed = tag.trim();
          if (!trimmed) continue;
          const tagId = `tag:${trimmed}`;
          addNode({ id: tagId, name: trimmed, type: 'tag', val: 2 });
          links.push({ source: nodeId, target: tagId });

          if (!tagToContent.has(trimmed)) tagToContent.set(trimmed, []);
          tagToContent.get(trimmed)!.push(nodeId);

          if (item.topic_id) {
            if (!topicTags.has(item.topic_id)) topicTags.set(item.topic_id, new Set());
            topicTags.get(item.topic_id)!.add(trimmed);
          }
        }
      }

      // Content → AI Keywords (merge with tag nodes by using same ID pattern)
      if (item.ai_keywords) {
        try {
          const aiKws: string[] = JSON.parse(item.ai_keywords);
          for (const kw of aiKws) {
            if (!kw) continue;
            const tagId = `tag:${kw}`;
            addNode({ id: tagId, name: kw, type: 'tag', val: 2 });
            links.push({ source: nodeId, target: tagId });

            if (!tagToContent.has(kw)) tagToContent.set(kw, []);
            tagToContent.get(kw)!.push(nodeId);
          }
        } catch {}
      }

      // Content → AI Entities
      if (item.ai_entities) {
        try {
          const aiEnt: Record<string, string[]> = JSON.parse(item.ai_entities);
          for (const [category, names] of Object.entries(aiEnt)) {
            for (const name of names) {
              if (!name) continue;
              const entityId = `entity:${category}:${name}`;
              addNode({ id: entityId, name, type: 'entity', val: 3, entityType: category });
              links.push({ source: nodeId, target: entityId });

              if (!entityToContent.has(name)) entityToContent.set(name, []);
              entityToContent.get(name)!.push(nodeId);
            }
          }
        } catch {}
      }
    }
  };

  addItems(articles, 'article');
  addItems(speeches, 'speech');
  addItems(papers, 'paper');

  // 3) Direct links between content sharing the same tag or entity
  const linkSet = new Set<string>();
  const existingLinks = new Set<string>();
  for (const link of links) {
    existingLinks.add(`${link.source}->${link.target}`);
    existingLinks.add(`${link.target}->${link.source}`);
  }

  // Shared tags → content-content links
  for (const [, contentIds] of tagToContent) {
    for (let i = 0; i < contentIds.length; i++) {
      for (let j = i + 1; j < contentIds.length; j++) {
        const key = `${contentIds[i]}->${contentIds[j]}`;
        if (!existingLinks.has(key) && !linkSet.has(key)) {
          linkSet.add(key);
          links.push({ source: contentIds[i], target: contentIds[j] });
        }
      }
    }
  }

  // Shared entities → content-content links
  for (const [, contentIds] of entityToContent) {
    for (let i = 0; i < contentIds.length; i++) {
      for (let j = i + 1; j < contentIds.length; j++) {
        const key = `${contentIds[i]}->${contentIds[j]}`;
        if (!existingLinks.has(key) && !linkSet.has(key)) {
          linkSet.add(key);
          links.push({ source: contentIds[i], target: contentIds[j] });
        }
      }
    }
  }

  // 4) Cross-topic links: topics sharing common keywords/tags
  const topicEntries = [...topicTags.entries()];
  for (let i = 0; i < topicEntries.length; i++) {
    for (let j = i + 1; j < topicEntries.length; j++) {
      const [t1, tags1] = topicEntries[i];
      const [t2, tags2] = topicEntries[j];
      const shared = [...tags1].filter(t => tags2.has(t));
      if (shared.length > 0) {
        const key = `topic:${t1}->topic:${t2}`;
        if (!linkSet.has(key)) {
          linkSet.add(key);
          links.push({ source: `topic:${t1}`, target: `topic:${t2}` });
        }
      }
    }
  }

  return NextResponse.json({ nodes, links });
}
