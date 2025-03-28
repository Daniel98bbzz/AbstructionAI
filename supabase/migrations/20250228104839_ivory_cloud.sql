/*
  # Create trigger to automatically create user record

  1. New Function
    - `handle_new_user`: Creates a record in the public.users table when a new auth.users record is created
  
  2. New Trigger
    - Trigger on auth.users table after insert
    - Calls handle_new_user function
*/

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, first_name, last_name, field_of_study, education_level)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'field_of_study',
    NEW.raw_user_meta_data->>'education_level'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create user record when a new auth user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();