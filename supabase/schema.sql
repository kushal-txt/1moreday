-- ====================================================================
-- 1MoreDay — Supabase Database Schema & Row-Level Security
-- Anonymous Peer Support Chat (Auto-deletes after 24 hours)
-- ====================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------------------
-- 1. MESSAGES TABLE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room TEXT NOT NULL,                         -- 'overthinking', 'heavy-chest', 'broken-ties', or 'dm-<uuid>'
    nickname TEXT NOT NULL,                     -- Anonymous display name
    user_id UUID NOT NULL,                      -- Anonymous Supabase Auth user id
    content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast room lookups sorted by timestamp
CREATE INDEX IF NOT EXISTS idx_messages_room_created_at ON public.messages (room, created_at ASC);

-- --------------------------------------------------------------------
-- 2. ROW-LEVEL SECURITY (RLS) FOR MESSAGES
-- --------------------------------------------------------------------
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Anyone can read messages created within the last 24 hours
DROP POLICY IF EXISTS "Allow read messages within 24 hours" ON public.messages;
CREATE POLICY "Allow read messages within 24 hours"
ON public.messages
FOR SELECT
USING (
    created_at > (now() - INTERVAL '24 hours')
);

-- Anyone (including anonymous users) can insert messages up to 500 characters
DROP POLICY IF EXISTS "Allow insert message" ON public.messages;
CREATE POLICY "Allow insert message"
ON public.messages
FOR INSERT
WITH CHECK (
    char_length(content) > 0 AND char_length(content) <= 500
);

-- --------------------------------------------------------------------
-- 3. RANDOM 1-ON-1 MATCHMAKING QUEUE & ROOMS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.match_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    nickname TEXT NOT NULL,
    matched_room_id UUID DEFAULT NULL,
    matched_peer_nick TEXT DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',     -- 'waiting', 'matched'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_queue_waiting ON public.match_queue (status, created_at ASC);

ALTER TABLE public.match_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read their own match queue" ON public.match_queue;
CREATE POLICY "Allow users to read their own match queue"
ON public.match_queue
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Allow users to insert/update queue" ON public.match_queue;
CREATE POLICY "Allow users to insert/update queue"
ON public.match_queue
FOR ALL
USING (true);

-- Atomic Matchmaking Function:
-- Either pairs with an existing waiting user or puts user in the queue
CREATE OR REPLACE FUNCTION public.match_random_peer(p_user_id UUID, p_nickname TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_record RECORD;
    v_new_room_id UUID;
BEGIN
    -- Delete stale waiting entries older than 2 minutes
    DELETE FROM public.match_queue WHERE created_at < (now() - INTERVAL '2 minutes') AND status = 'waiting';

    -- Check if someone else is currently waiting
    SELECT * INTO v_target_record
    FROM public.match_queue
    WHERE status = 'waiting'
      AND user_id != p_user_id
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF FOUND THEN
        -- Match found! Create a shared room ID
        v_new_room_id := gen_random_uuid();

        -- Update the waiting user so they receive the match
        UPDATE public.match_queue
        SET status = 'matched',
            matched_room_id = v_new_room_id,
            matched_peer_nick = p_nickname
        WHERE id = v_target_record.id;

        -- Return immediate match to current caller
        RETURN jsonb_build_object(
            'status', 'matched',
            'room_id', v_new_room_id,
            'peer_nickname', v_target_record.nickname
        );
    ELSE
        -- No waiting user found: insert/replace self in queue
        INSERT INTO public.match_queue (user_id, nickname, status)
        VALUES (p_user_id, p_nickname, 'waiting')
        ON CONFLICT (user_id) DO UPDATE
        SET nickname = p_nickname,
            status = 'waiting',
            matched_room_id = NULL,
            matched_peer_nick = NULL,
            created_at = now();

        RETURN jsonb_build_object(
            'status', 'waiting'
        );
    END IF;
END;
$$;

-- Function to leave queue
CREATE OR REPLACE FUNCTION public.leave_match_queue(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.match_queue WHERE user_id = p_user_id;
END;
$$;

-- --------------------------------------------------------------------
-- 4. USER REPORTS TABLE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL,
    reported_nickname TEXT NOT NULL,
    reason TEXT NOT NULL,
    room TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow insert report" ON public.reports;
CREATE POLICY "Allow insert report"
ON public.reports
FOR INSERT
WITH CHECK (true);

-- --------------------------------------------------------------------
-- 5. 24-HOUR AUTO-PURGE FUNCTION
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_expired_messages()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.messages
    WHERE created_at < (now() - INTERVAL '24 hours');
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- --------------------------------------------------------------------
-- 6. ENABLE SUPABASE REALTIME REPLICATION
-- --------------------------------------------------------------------
DO $$
BEGIN
    -- Add messages table to realtime publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;

    -- Add match_queue table to realtime publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'match_queue'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.match_queue;
    END IF;
END;
$$;


-- --------------------------------------------------------------------
-- 7. GRANT PERMISSIONS TO ANON AND AUTHENTICATED ROLES
-- --------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated;
