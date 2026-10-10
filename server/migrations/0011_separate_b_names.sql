-- .b names are their own set: hello.b and hello.biggle can be different sites. A .b site's
-- key in the database is "hello.b"; a .biggle site's key stays "hello". Sites already moved to
-- .b get the ".b" key, which frees their .biggle name.
INSERT INTO names (name, url, title, owner_id, status, review_note, created_at, updated_at, live, tld)
  SELECT name || '.b', url, title, owner_id, status, review_note, created_at, updated_at, live, 'b'
  FROM names WHERE tld = 'b' AND name NOT LIKE '%.b';
UPDATE site_files SET site = site || '.b'
  WHERE site IN (SELECT name FROM names WHERE tld = 'b' AND name NOT LIKE '%.b');
DELETE FROM names WHERE tld = 'b' AND name NOT LIKE '%.b';
