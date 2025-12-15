-- Update function to check if email exists in auth.users
-- This version uses COALESCE to ensure it never returns NULL
DROP FUNCTION IF EXISTS public.check_email_exists(TEXT);

CREATE OR REPLACE FUNCTION public.check_email_exists(email_to_check TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    email_exists BOOLEAN;
BEGIN
    -- Check if email exists in auth.users (case-insensitive)
    SELECT EXISTS (
        SELECT 1 
        FROM auth.users 
        WHERE LOWER(email) = LOWER(email_to_check)
        AND deleted_at IS NULL
    ) INTO email_exists;
    
    RETURN COALESCE(email_exists, false);
END;
$$;

-- Grant execute permission to anon and authenticated users
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.check_email_exists(TEXT) IS 'Checks if an email is registered in auth.users without exposing user data. Returns false if email does not exist.';
