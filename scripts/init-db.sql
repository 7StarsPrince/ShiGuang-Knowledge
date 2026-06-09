-- 拾光知识库 Database Schema

CREATE DATABASE IF NOT EXISTS insight_vault CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE insight_vault;

-- 峰会演讲
CREATE TABLE IF NOT EXISTS speeches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  conference VARCHAR(300),
  speaker VARCHAR(200),
  speech_date DATE,
  transcript LONGTEXT,
  audio_path VARCHAR(500),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- PPT 图片
CREATE TABLE IF NOT EXISTS speech_slides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  speech_id INT NOT NULL,
  slide_order INT DEFAULT 0,
  image_path VARCHAR(500) NOT NULL,
  FOREIGN KEY (speech_id) REFERENCES speeches(id) ON DELETE CASCADE
);

-- 文章收藏
CREATE TABLE IF NOT EXISTS articles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  source_name VARCHAR(200),
  source_url VARCHAR(1000),
  author VARCHAR(200),
  summary TEXT,
  content LONGTEXT,
  cover_image VARCHAR(500),
  published_at DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 标签
CREATE TABLE IF NOT EXISTS tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

-- 演讲-标签 多对多
CREATE TABLE IF NOT EXISTS speech_tags (
  speech_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (speech_id, tag_id),
  FOREIGN KEY (speech_id) REFERENCES speeches(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- 文章-标签 多对多
CREATE TABLE IF NOT EXISTS article_tags (
  article_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (article_id, tag_id),
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
