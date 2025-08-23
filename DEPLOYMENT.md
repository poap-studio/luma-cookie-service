# Deployment Instructions for Luma Cookie Service

## Prerequisites

1. **SSH Key**: Download the SSH key from 1Password
   - Vault: `claude-personal-claude`
   - Item: `AWS EC2 - Luma Cookie Service`
   - Save as: `luma-cookie-service.pem`

2. **Set permissions** on the SSH key:
   ```bash
   chmod 600 luma-cookie-service.pem
   ```

## Option 1: Using the Deploy Script (Recommended)

1. Set the SSH key path:
   ```bash
   export SSH_KEY_PATH=/path/to/luma-cookie-service.pem
   ```

2. Run the deploy script:
   ```bash
   cd /Users/gotoalberto/luma-cookie-service
   ./deploy.sh
   ```

## Option 2: Manual Deployment

1. SSH into the server:
   ```bash
   ssh -i luma-cookie-service.pem ubuntu@54.147.7.9
   ```

2. Navigate to the service directory:
   ```bash
   cd /home/ubuntu/luma-cookie-service
   ```

3. Pull the latest changes:
   ```bash
   git pull origin master
   ```

4. Install dependencies:
   ```bash
   npm install
   ```

5. Generate Prisma client:
   ```bash
   npx prisma generate
   ```

6. Update the `.env` file if needed:
   ```bash
   nano .env
   ```
   
   Ensure it contains:
   ```
   # Luma Credentials
   LUMA_EMAIL=admin@poap.fr
   LUMA_PASSWORD=!q*g%@TP7w^q
   
   # Database URL (from poap-farcaster-saas)
   DATABASE_URL="postgresql://postgres:AATDbEXO1K@poap-farcaster-db.cuayvp8dpvrg.us-east-1.rds.amazonaws.com:5432/postgres"
   
   # PM2 Process Name
   PM2_NAME=luma-cookie-service
   ```

7. Restart the service:
   ```bash
   pm2 restart luma-cookie-service
   ```

8. Check the status:
   ```bash
   pm2 status
   pm2 logs luma-cookie-service
   ```

## Verification

1. Check if the service is running:
   ```bash
   pm2 status
   ```

2. View the logs:
   ```bash
   pm2 logs luma-cookie-service --lines 50
   ```

3. Trigger a manual update:
   ```bash
   pm2 trigger luma-cookie-service update
   ```

4. Check the database for the latest cookie:
   ```bash
   # Connect to the database
   psql "postgresql://postgres:AATDbEXO1K@poap-farcaster-db.cuayvp8dpvrg.us-east-1.rds.amazonaws.com:5432/postgres"
   
   # Query the latest cookie
   SELECT id, "createdAt", "expiresAt", "isValid" 
   FROM "LumaCookie" 
   WHERE "isValid" = true 
   ORDER BY "createdAt" DESC 
   LIMIT 1;
   ```

## Troubleshooting

### Service won't start
- Check logs: `pm2 logs luma-cookie-service --err`
- Verify environment variables: `cat .env`
- Check database connectivity

### Cookie extraction fails
- Check Luma credentials in `.env`
- Verify Chrome/Chromium is installed: `which chromium-browser`
- Check logs for specific error messages

### Database connection issues
- Verify DATABASE_URL is correct
- Check security group allows connection from EC2
- Test connection: `psql $DATABASE_URL -c "SELECT 1"`

## Service Architecture

The service now:
- Runs every 4 hours (cron: `0 */4 * * *`)
- Saves cookies directly to the PostgreSQL database
- Automatically invalidates old cookies
- Cleans up cookies older than 30 days
- No longer updates Vercel environment variables
- No longer runs a webhook server