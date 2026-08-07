-- Account-level Locker bio authority (decoupled from lantern_avatar_profiles.current_avatar_key).
ALTER TABLE lantern_pilot_accounts ADD COLUMN bio TEXT;
