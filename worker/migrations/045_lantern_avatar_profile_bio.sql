-- Private Locker bio: plain-text personal profile field on existing avatar profile row.
ALTER TABLE lantern_avatar_profiles ADD COLUMN bio TEXT;
