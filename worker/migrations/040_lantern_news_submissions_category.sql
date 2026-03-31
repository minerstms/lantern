-- Optional school-news category label (e.g. Events, School News) for Worker-backed posts.
ALTER TABLE lantern_news_submissions ADD COLUMN category TEXT NULL;
