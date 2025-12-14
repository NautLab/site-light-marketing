-- Create function to check if email exists in auth.users
-- This function is secure and doesn't expose user data
CREATE OR REPLACE FUNCTION public.check_email_exists(email_to_check TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM auth.users 
        WHERE email = LOWER(email_to_check)
        AND deleted_at IS NULL
    );
END;
$$;

-- Grant execute permission to anon and authenticated users
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.check_email_exists(TEXT) IS 'Checks if an email is registered in the system without exposing user data';
