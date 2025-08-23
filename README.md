# Luma Cookie Service

Automated service that maintains fresh Luma authentication cookies for the POAP platform. It periodically extracts cookies from Luma using Puppeteer and saves them directly to the database every 4 hours.

## AWS Infrastructure

### EC2 Instance Details
- **Instance ID**: `i-080272c5028db9c74`
- **Public IP**: `54.147.7.9`
- **Region**: `us-east-1`
- **Instance Type**: `t2.micro`
- **Security Group**: `sg-03cad80bf001c61f1` (luma-cookie-service-sg)
  - Port 22 (SSH) - Open to 0.0.0.0/0

### Access Credentials
- **AWS Account**: POAP Studio (Account ID: 893980883769)
- **AWS Credentials**: Stored in 1Password
  - Vault: `claude-personal-claude`
  - Item: `AWS POAP Studio Personal`
  - Contains: Access Key ID and Secret Access Key
- **SSH Key (PEM)**: Stored in 1Password
  - Vault: `claude-personal-claude`
  - Item: `AWS EC2 - Luma Cookie Service`
  - Key Name: `luma-cookie-service`

### SSH Access
```bash
# Download the PEM from 1Password and save it as luma-cookie-service.pem
chmod 600 luma-cookie-service.pem
ssh -i luma-cookie-service.pem ubuntu@54.147.7.9
```

### AWS CLI Configuration
```bash
# Get credentials from 1Password
op item get "AWS POAP Studio Personal" --vault "claude-personal-claude"

# Configure AWS CLI
export AWS_ACCESS_KEY_ID="<from-1password>"
export AWS_SECRET_ACCESS_KEY="<from-1password>"
export AWS_DEFAULT_REGION="us-east-1"

# Manage instance
aws ec2 describe-instances --instance-ids i-080272c5028db9c74
aws ec2 stop-instances --instance-ids i-080272c5028db9c74
aws ec2 start-instances --instance-ids i-080272c5028db9c74
```

## Features

1. **Cookie Extraction**: Uses Puppeteer to login to Luma and extract session cookies
2. **Cookie Validation**: Tests extracted cookies before saving
3. **Database Update**: Saves the cookie directly to the PostgreSQL database
4. **Cleanup**: Removes old and invalid cookies from the database

## Operation

- Runs automatically every 4 hours
- Manual trigger via PM2: `pm2 trigger luma-cookie-service update`
- Automatic cleanup of cookies older than 30 days

## Installation

1. Clone the repository and install dependencies:
```bash
git clone https://github.com/gotoalberto/luma-cookie-service.git
cd luma-cookie-service
npm install
```

2. Create a `.env` file with your configuration:
```bash
# Luma Credentials
LUMA_EMAIL=your-email@example.com
LUMA_PASSWORD=your-password

# Database Configuration
DATABASE_URL=postgresql://user:password@host:port/database

# PM2 Process Name (Optional)
PM2_NAME=luma-cookie-service
```

### Database Setup

Ensure your PostgreSQL database has the LumaCookie table. If using with poap-farcaster-saas, the schema is already included.

### PM2 Deployment

Start the service with PM2:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Service Management

### Check Status
```bash
# SSH into the server
ssh -i luma-cookie-service.pem ubuntu@54.147.7.9

# Check service status
pm2 status

# View logs
pm2 logs luma-cookie-service
```

### Manual Update

Trigger a manual cookie update:
```bash
pm2 trigger luma-cookie-service update
```

### Check Logs

```bash
pm2 logs luma-cookie-service
```

### Update Deployment
```bash
# On the EC2 instance
ssh -i luma-cookie-service.pem ubuntu@54.147.7.9
cd /home/ubuntu/luma-cookie-service
git pull
npm install
pm2 restart luma-cookie-service
```

## Project Structure

```
/src
  /services
    - cookie-extractor.js    # Puppeteer logic for cookie extraction
    - scheduler.js          # Cron job management
    - database-updater.js   # Database integration
  /utils
    - logger.js            # Winston logging configuration
  - index.js              # Main application entry point
```

## Technical Details

- Cookie extraction uses headless Chrome via Puppeteer
- Logs are written to `app.log` and console
- Failed updates will retry up to 3 times
- Old cookies are automatically cleaned up after 30 days
- The service runs every 4 hours to ensure fresh cookies

## Architecture

- **PM2**: Process management and auto-restart
- **Puppeteer**: Browser automation for cookie extraction
- **Node-cron**: Scheduled tasks (cron: `0 */4 * * *`)
- **Prisma**: Database ORM for PostgreSQL
- **Winston**: Logging

## Troubleshooting

### Cookie extraction fails
- Check Luma credentials in `.env`
- Review logs for specific errors: `pm2 logs luma-cookie-service`
- Ensure Chrome/Chromium is properly installed

### Service doesn't start
- Check PM2 status: `pm2 status`
- Review error logs: `pm2 logs luma-cookie-service --err`
- Verify database connection string

### Database connection issues
- Verify DATABASE_URL in `.env`
- Check network connectivity to database
- Ensure database user has proper permissions

## Backup and Recovery

### Backup current configuration
```bash
# On EC2 instance
tar -czf luma-service-backup.tar.gz /home/ubuntu/luma-cookie-service/.env

# Download to local
scp -i luma-cookie-service.pem ubuntu@54.147.7.9:~/luma-service-backup.tar.gz .
```

### Create AMI for disaster recovery
```bash
aws ec2 create-image \
  --instance-id i-080272c5028db9c74 \
  --name "luma-cookie-service-$(date +%Y%m%d)" \
  --description "Backup of Luma Cookie Service"
```