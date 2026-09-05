-- Run this in Supabase SQL Editor to CHECK if everything was set up correctly
-- You should see all your tables listed below

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
