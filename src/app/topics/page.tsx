'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Topic {
  id: number;
  name: string;
  parent_id: number | null;
  sort_order: number;
  direct_count: number;
  total_count: number;
  children: Topic[];
}

interface ContentItem {
  id: number;
  title: string;
  type: 'speech' | 'article';
  speaker?: string;
  source_name?: string;
  conference?: string;
  speech_date?: string;
  published_at?: string;
  tags?: string;
  topic_id: number;
}

interface PickableItem {
  id: number;
  title: string;
  type: 'speech' | 'article';
  speaker?: string;
  source_name?: string;
  topic_id: number | null;
  topic_name?: string;
}

export default function TopicsPage() {
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [content, setContent] = useState<{ speeches: ContentItem[]; articles: ContentItem[] }>({ speeches: [], articles: [] });
  const [loading, setLoading] = useState(true);

  // Inline editing state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  // Add topic state
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [newName, setNewName] = useState('');

  // Add content modal state
  const [showPicker, setShowPicker] = useState(false);
  const [pickerItems, setPickerItems] = useState<PickableItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerTab, setPickerTab] = useState<'speech' | 'article'>('speech');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);

  const fetchTopics = useCallback(() => {
    fetch('/api/topics').then(r => r.json()).then((data: Topic[]) => {
      setTopics(data);
      setExpandedIds(new Set(data.map(t => t.id)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchTopics(); }, [fetchTopics]);

  // Fetch content when topic selected
  useEffect(() => {
    if (!selectedId) {
      setContent({ speeches: [], articles: [] });
      return;
    }
    fetch(`/api/topics/${selectedId}/content`).then(r => r.json()).then(data => {
      setContent(data);
    }).catch(() => setContent({ speeches: [], articles: [] }));
  }, [selectedId]);

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAdd = async (parentId: number | null) => {
    if (!newName.trim()) return;
    await fetch('/api/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), parent_id: parentId }),
    });
    setNewName('');
    setAddingTo(null);
    fetchTopics();
  };

  const handleRename = async (id: number) => {
    if (!editName.trim()) return;
    await fetch(`/api/topics/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim() }),
    });
    setEditingId(null);
    fetchTopics();
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`确定要删除话题「${name}」吗？子话题和关联内容不会被删除，只是解除关联。`)) return;
    await fetch(`/api/topics/${id}`, { method: 'DELETE' });
    if (selectedId === id) setSelectedId(null);
    fetchTopics();
  };

  const startEditing = (topic: Topic) => {
    setEditingId(topic.id);
    setEditName(topic.name);
  };

  // Open content picker modal
  const openPicker = async () => {
    if (!selectedId) return;
    setShowPicker(true);
    setPickerLoading(true);
    setSelectedItems(new Set());
    setPickerSearch('');
    try {
      const [speechRes, articleRes] = await Promise.all([
        fetch('/api/speeches?limit=500').then(r => r.json()),
        fetch('/api/articles?limit=500').then(r => r.json()),
      ]);
      const items: PickableItem[] = [
        ...(speechRes.data || []).map((s: any) => ({
          id: s.id, title: s.title, type: 'speech' as const,
          speaker: s.speaker, topic_id: s.topic_id || null,
        })),
        ...(articleRes.data || []).map((a: any) => ({
          id: a.id, title: a.title, type: 'article' as const,
          source_name: a.source_name, topic_id: a.topic_id || null,
        })),
      ];
      setPickerItems(items);
    } catch { setPickerItems([]); }
    setPickerLoading(false);
  };

  // Assign selected items to current topic
  const handleAssign = async () => {
    if (!selectedId || selectedItems.size === 0) return;
    setAssigning(true);
    try {
      const updates: Promise<any>[] = [];
      for (const key of selectedItems) {
        const [type, idStr] = key.split('-');
        const id = Number(idStr);
        const endpoint = type === 'speech' ? `/api/speeches/${id}` : `/api/articles/${id}`;
        // Fetch current data first
        const res = await fetch(endpoint);
        const data = await res.json();
        // Update with new topic_id
        if (type === 'speech') {
          updates.push(fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, topic_id: selectedId, tags: data.tags ? data.tags.split(',') : [] }),
          }));
        } else {
          updates.push(fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, topic_id: selectedId, tags: data.tags ? data.tags.split(',') : [] }),
          }));
        }
      }
      await Promise.all(updates);
      setShowPicker(false);
      // Refresh content and topics
      fetchTopics();
      const contentRes = await fetch(`/api/topics/${selectedId}/content`);
      setContent(await contentRes.json());
    } catch { alert('分配失败'); }
    setAssigning(false);
  };

  // Remove an item from current topic
  const handleRemoveFromTopic = async (item: ContentItem) => {
    const endpoint = item.type === 'speech' ? `/api/speeches/${item.id}` : `/api/articles/${item.id}`;
    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, topic_id: null, tags: data.tags ? data.tags.split(',') : [] }),
      });
      // Refresh
      fetchTopics();
      const contentRes = await fetch(`/api/topics/${selectedId}/content`);
      setContent(await contentRes.json());
    } catch { alert('移除失败'); }
  };

  const toggleSelect = (key: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const allContent: ContentItem[] = [
    ...content.speeches.map(s => ({ ...s, type: 'speech' as const })),
    ...content.articles.map(a => ({ ...a, type: 'article' as const })),
  ].sort((a, b) => {
    const dateA = a.speech_date || a.published_at || '';
    const dateB = b.speech_date || b.published_at || '';
    return dateB.localeCompare(dateA);
  });

  const selectedTopic = findTopic(topics, selectedId);

  // Filter picker items
  const filteredPicker = pickerItems
    .filter(i => i.type === pickerTab)
    .filter(i => !pickerSearch || i.title.toLowerCase().includes(pickerSearch.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">话题管理</h1>
          <p className="text-xs text-gray-500 mt-1">按话题统一管理峰会演讲和公众号文章</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500 text-sm">Loading...</div>
      ) : (
        <div className="flex gap-6">
          {/* Left: Topic tree */}
          <div className="w-72 shrink-0 bg-gray-900/30 border border-gray-800/40 rounded-xl p-4 h-fit max-h-[calc(100vh-180px)] overflow-y-auto">
            {addingTo === -1 && (
              <div className="flex gap-1.5 mb-3">
                <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd(null)}
                  placeholder="一级话题名称" autoFocus className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50" />
                <button onClick={() => handleAdd(null)} className="px-2 py-1 bg-blue-600 text-white text-[10px] rounded">确定</button>
                <button onClick={() => { setAddingTo(null); setNewName(''); }} className="px-2 py-1 bg-gray-800 text-gray-400 text-[10px] rounded">取消</button>
              </div>
            )}

            <div className="space-y-0.5">
              {topics.map(topic => (
                <TopicNode key={topic.id} topic={topic} depth={0}
                  selectedId={selectedId} expandedIds={expandedIds}
                  editingId={editingId} editName={editName}
                  addingTo={addingTo} newName={newName}
                  onSelect={setSelectedId} onToggle={toggleExpand}
                  onStartEdit={startEditing} onEditNameChange={setEditName}
                  onRename={handleRename} onDelete={handleDelete}
                  onAddStart={(parentId) => { setAddingTo(parentId); setNewName(''); }}
                  onAdd={handleAdd} onNewNameChange={setNewName}
                  onCancelAdd={() => { setAddingTo(null); setNewName(''); }}
                />
              ))}
            </div>

            <button onClick={() => { setAddingTo(-1); setNewName(''); }}
              className="w-full mt-3 py-1.5 text-[11px] text-gray-500 hover:text-gray-300 bg-gray-800/30 hover:bg-gray-800/60 rounded-lg transition-colors">
              + 添加一级话题
            </button>
          </div>

          {/* Right: Content list */}
          <div className="flex-1 min-w-0">
            {selectedTopic ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-white">{selectedTopic.name}</h2>
                    <span className="text-[10px] text-gray-500">{allContent.length} 条内容</span>
                  </div>
                  <button onClick={openPicker}
                    className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs rounded-lg transition-colors flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    添加内容
                  </button>
                </div>
                {allContent.length === 0 ? (
                  <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-12 text-center">
                    <p className="text-gray-600 text-sm mb-3">该话题下暂无内容</p>
                    <button onClick={openPicker}
                      className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs rounded-lg transition-colors">
                      从已有内容中添加
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {allContent.map(item => (
                      <div key={`${item.type}-${item.id}`}
                        className="group bg-gray-900/30 border border-gray-800/40 rounded-xl p-3 hover:bg-gray-800/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <Link href={`/${item.type === 'speech' ? 'speeches' : 'articles'}/${item.id}`} className="flex-1 min-w-0 flex items-center gap-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                              item.type === 'speech' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'
                            }`}>
                              {item.type === 'speech' ? '演讲' : '文章'}
                            </span>
                            <span className="text-sm text-gray-200 flex-1 truncate">{item.title}</span>
                            {item.type === 'speech' && item.speaker && <span className="text-[10px] text-gray-500 shrink-0">{item.speaker}</span>}
                            {item.type === 'article' && item.source_name && <span className="text-[10px] text-gray-500 shrink-0">{item.source_name}</span>}
                          </Link>
                          <button onClick={() => handleRemoveFromTopic(item)}
                            className="opacity-0 group-hover:opacity-100 px-2 py-1 text-[10px] text-gray-500 hover:text-red-400 bg-gray-800/40 rounded transition-all shrink-0">
                            移除
                          </button>
                        </div>
                        {item.tags && (
                          <Link href={`/${item.type === 'speech' ? 'speeches' : 'articles'}/${item.id}`}>
                            <div className="flex gap-1.5 mt-1.5 ml-14">
                              {item.tags.split(',').map(tag => (
                                <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-gray-800/50 text-gray-500 rounded">{tag}</span>
                              ))}
                            </div>
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="bg-gray-900/30 border border-gray-800/40 rounded-xl p-12 text-center">
                <svg className="w-10 h-10 text-gray-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                <p className="text-gray-600 text-sm">选择左侧话题查看内容</p>
                <p className="text-gray-700 text-xs mt-1">或创建新话题开始分类管理</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content Picker Modal */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#111] border border-gray-800 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-gray-800/60">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">
                  添加内容到「{selectedTopic?.name}」
                </h3>
                <button onClick={() => setShowPicker(false)} className="text-gray-500 hover:text-gray-300">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                placeholder="搜索标题..." autoFocus
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50" />
              {/* Tab */}
              <div className="flex gap-1 mt-3 bg-gray-900/50 rounded-lg p-0.5">
                <button onClick={() => setPickerTab('speech')}
                  className={`flex-1 py-1.5 text-[11px] rounded-md transition-colors ${pickerTab === 'speech' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                  峰会演讲
                </button>
                <button onClick={() => setPickerTab('article')}
                  className={`flex-1 py-1.5 text-[11px] rounded-md transition-colors ${pickerTab === 'article' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                  公众号文章
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
              {pickerLoading ? (
                <div className="text-center py-8 text-gray-500 text-xs">加载中...</div>
              ) : filteredPicker.length === 0 ? (
                <div className="text-center py-8 text-gray-600 text-xs">没有找到内容</div>
              ) : (
                filteredPicker.map(item => {
                  const key = `${item.type}-${item.id}`;
                  const checked = selectedItems.has(key);
                  const alreadyHere = item.topic_id === selectedId;
                  return (
                    <label key={key}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        alreadyHere ? 'bg-blue-900/10 opacity-50' : checked ? 'bg-blue-600/15 border border-blue-500/30' : 'hover:bg-gray-800/40'
                      }`}>
                      <input type="checkbox" checked={checked} disabled={alreadyHere}
                        onChange={() => toggleSelect(key)}
                        className="w-3.5 h-3.5 rounded border-gray-600 text-blue-500 focus:ring-blue-500/30 bg-gray-800" />
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                        item.type === 'speech' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {item.type === 'speech' ? '演讲' : '文章'}
                      </span>
                      <span className="text-xs text-gray-200 flex-1 truncate">{item.title}</span>
                      {alreadyHere ? (
                        <span className="text-[10px] text-blue-400/60 shrink-0">已在此话题</span>
                      ) : item.topic_id ? (
                        <span className="text-[10px] text-amber-400/60 shrink-0">将更换话题</span>
                      ) : null}
                    </label>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-800/60 flex items-center justify-between">
              <span className="text-[11px] text-gray-500">已选 {selectedItems.size} 项</span>
              <div className="flex gap-2">
                <button onClick={() => setShowPicker(false)}
                  className="px-4 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg">
                  取消
                </button>
                <button onClick={handleAssign} disabled={selectedItems.size === 0 || assigning}
                  className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors">
                  {assigning ? '分配中...' : `确认添加 (${selectedItems.size})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function findTopic(topics: Topic[], id: number | null): Topic | null {
  if (!id) return null;
  for (const t of topics) {
    if (t.id === id) return t;
    const found = findTopic(t.children, id);
    if (found) return found;
  }
  return null;
}

function TopicNode({
  topic, depth, selectedId, expandedIds, editingId, editName, addingTo, newName,
  onSelect, onToggle, onStartEdit, onEditNameChange, onRename, onDelete,
  onAddStart, onAdd, onNewNameChange, onCancelAdd,
}: {
  topic: Topic; depth: number; selectedId: number | null;
  expandedIds: Set<number>; editingId: number | null; editName: string;
  addingTo: number | null; newName: string;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  onStartEdit: (topic: Topic) => void;
  onEditNameChange: (name: string) => void;
  onRename: (id: number) => void;
  onDelete: (id: number, name: string) => void;
  onAddStart: (parentId: number) => void;
  onAdd: (parentId: number) => void;
  onNewNameChange: (name: string) => void;
  onCancelAdd: () => void;
}) {
  const isExpanded = expandedIds.has(topic.id);
  const isSelected = selectedId === topic.id;
  const isEditing = editingId === topic.id;
  const hasChildren = topic.children.length > 0;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
          isSelected ? 'bg-blue-600/15 text-blue-400' : 'hover:bg-gray-800/40 text-gray-300'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button onClick={(e) => { e.stopPropagation(); onToggle(topic.id); }}
            className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-300 shrink-0">
            <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {isEditing ? (
          <input value={editName} onChange={e => onEditNameChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onRename(topic.id); if (e.key === 'Escape') onStartEdit({ id: -1 } as any); }}
            onBlur={() => onRename(topic.id)}
            autoFocus className="flex-1 bg-gray-800/50 border border-blue-500/30 rounded px-1.5 py-0.5 text-xs text-gray-200 focus:outline-none min-w-0"
            onClick={e => e.stopPropagation()} />
        ) : (
          <span className="flex-1 truncate text-xs" onClick={() => onSelect(topic.id)}>
            {topic.name}
          </span>
        )}

        <span className="text-[10px] text-gray-600 shrink-0">{topic.total_count || 0}</span>

        {!isEditing && (
          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
            <button onClick={(e) => { e.stopPropagation(); onAddStart(topic.id); }}
              className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-blue-400 rounded"
              title="添加子话题">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); onStartEdit(topic); }}
              className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-gray-300 rounded">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(topic.id, topic.name); }}
              className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-red-400 rounded">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        )}
      </div>

      {isExpanded && hasChildren && (
        <div>
          {topic.children.map(child => (
            <TopicNode key={child.id} topic={child} depth={depth + 1}
              selectedId={selectedId} expandedIds={expandedIds}
              editingId={editingId} editName={editName}
              addingTo={addingTo} newName={newName}
              onSelect={onSelect} onToggle={onToggle}
              onStartEdit={onStartEdit} onEditNameChange={onEditNameChange}
              onRename={onRename} onDelete={onDelete}
              onAddStart={onAddStart} onAdd={onAdd}
              onNewNameChange={onNewNameChange} onCancelAdd={onCancelAdd}
            />
          ))}
        </div>
      )}
      {addingTo === topic.id && (
        <div className="flex gap-1.5 py-1" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
          <input value={newName} onChange={e => onNewNameChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onAdd(topic.id); if (e.key === 'Escape') onCancelAdd(); }}
            placeholder="子话题名称" autoFocus
            className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded px-2 py-0.5 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500/50 min-w-0" />
          <button onClick={() => onAdd(topic.id)} className="px-2 py-0.5 bg-blue-600 text-white text-[10px] rounded">确定</button>
          <button onClick={onCancelAdd} className="px-2 py-0.5 bg-gray-800 text-gray-400 text-[10px] rounded">取消</button>
        </div>
      )}
    </div>
  );
}
