# Manual Cookie Update Instructions

Due to authentication issues with Luma's login system, you may need to manually update the cookie. Follow these steps:

## How to Get the Cookie Manually

1. **Open Chrome/Firefox** and navigate to https://lu.ma/signin
2. **Login manually** with your credentials (admin@poap.fr)
3. **After successful login**, open Developer Tools (F12)
4. Go to the **Application** tab (Chrome) or **Storage** tab (Firefox)
5. Look for **Cookies** → **https://lu.ma**
6. Find a cookie that looks like a session cookie. It might be named:
   - `luma.auth-session-key`
   - `auth-session-key`
   - `__Secure-next-auth.session-token`
   - Or any long cookie value that looks like a JWT token

## Update the Cookie in Database

### Option 1: Using the Manual Script (Recommended)

1. SSH into the server:
   ```bash
   ssh -i luma-cookie-service.pem ubuntu@54.226.204.33
   ```

2. Navigate to the service directory:
   ```bash
   cd /home/ubuntu/luma-cookie-service
   ```

3. Run the manual update script:
   ```bash
   node manual-cookie-update.js "cookie-name=cookie-value"
   ```
   
   Example:
   ```bash
   node manual-cookie-update.js "luma.auth-session-key=eyJhbGciOiJIUzI1NiIsInR5..."
   ```

### Option 2: Direct Database Update

1. Connect to the database:
   ```bash
   psql "postgresql://postgres:AATDbEXO1K@poap-farcaster-db.cuayvp8dpvrg.us-east-1.rds.amazonaws.com:5432/postgres"
   ```

2. Invalidate old cookies:
   ```sql
   UPDATE "LumaCookie" SET "isValid" = false WHERE "isValid" = true;
   ```

3. Insert new cookie:
   ```sql
   INSERT INTO "LumaCookie" (id, cookie, "expiresAt", "createdAt", "updatedAt", "isValid")
   VALUES (
     gen_random_uuid()::text,
     'cookie-name=cookie-value',
     NOW() + INTERVAL '30 days',
     NOW(),
     NOW(),
     true
   );
   ```

## Verify the Cookie Works

After updating, verify the cookie works by checking if the poap-farcaster-saas can access Luma events:

1. Test with a known event:
   ```bash
   curl -X POST https://social.poap.studio/api/luma/validate-event \
     -H "Content-Type: application/json" \
     -d '{"eventId": "evt-dFABGoCDVLecXHG"}'
   ```

2. If it returns event data, the cookie is working!

## Troubleshooting

- **Cookie not working**: Make sure you copied the complete cookie value including the name
- **Still getting 401 errors**: The cookie might be wrong or expired
- **Can't find the right cookie**: Try looking for any cookie with a long value (100+ characters) that looks like a JWT token

## Long-term Solution

We need to investigate why the automated login is failing. Possible causes:
1. Luma has added captcha or anti-bot protection
2. The login flow has changed
3. 2FA is required on the account
4. The account needs email verification

For now, manual cookie updates will keep the service running.