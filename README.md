# Luma Cookie Service

Automated service to renew Luma session cookies for the POAP platform. This service runs on AWS EC2 and updates the cookie every 24 hours.

## AWS Infrastructure

### EC2 Instance Details
- **Instance ID**: `i-080272c5028db9c74`
- **Public IP**: `54.147.7.9`
- **Region**: `us-east-1`
- **Instance Type**: `t2.micro`
- **Security Group**: `sg-03cad80bf001c61f1` (luma-cookie-service-sg)
  - Port 22 (SSH) - Open to 0.0.0.0/0
  - Port 3001 (Webhook) - Open to 0.0.0.0/0

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

## Service Configuration

### Environment Variables
The service uses the following environment variables (configured in `/home/ubuntu/luma-cookie-service/.env`):
- `LUMA_EMAIL`: admin@poap.fr
- `LUMA_PASSWORD`: !q*g%@TP7w^q
- `NODE_ENV`: production
- `WEBHOOK_URL`: http://54.147.7.9:3001/webhook
- `WEBHOOK_SECRET`: 37c860512fe98aafe08b3042dc03fb28a33612df70ed79518db1119f9ebc1021

### Service Management
```bash
# SSH into the server
ssh -i luma-cookie-service.pem ubuntu@54.147.7.9

# Check service status
pm2 status
sudo systemctl status luma-cookie-service

# View logs
pm2 logs luma-cookie-service

# Restart service
pm2 restart luma-cookie-service

# Update from GitHub
cd /home/ubuntu/luma-cookie-service
git pull
npm install
pm2 restart luma-cookie-service
```

### Endpoints
- **Health Check**: http://54.147.7.9:3001/health
- **Webhook**: http://54.147.7.9:3001/webhook

## Vercel Integration

Configure these environment variables in your Vercel project:
- `LUMA_COOKIE_WEBHOOK_URL`: http://54.147.7.9:3001/webhook
- `LUMA_COOKIE_WEBHOOK_SECRET`: 37c860512fe98aafe08b3042dc03fb28a33612df70ed79518db1119f9ebc1021

## Features

- Automated cookie extraction using Puppeteer
- Daily renewal at 2 AM (UTC)
- Automatic restart on failure with PM2
- Webhook server for external notifications
- Systemd service integration for auto-start on reboot
- Health check endpoint for monitoring

## Architecture

- **PM2**: Process management and auto-restart
- **Systemd**: System service integration  
- **Puppeteer**: Browser automation for cookie extraction
- **Node-cron**: Scheduled tasks (cron: `0 2 * * *`)
- **Express**: Webhook server
- **Winston**: Logging

## Deployment

The service is deployed as follows:
1. Node.js application managed by PM2
2. PM2 is configured to start on system boot via systemd
3. Service runs as user `ubuntu`
4. Logs are stored in `/home/ubuntu/luma-cookie-service/logs/`

### Update Deployment
```bash
# On your local machine
git push origin master

# On the EC2 instance
ssh -i luma-cookie-service.pem ubuntu@54.147.7.9
cd /home/ubuntu/luma-cookie-service
git pull
npm install
pm2 restart luma-cookie-service
```

## Monitoring

### Check if service is running
```bash
curl http://54.147.7.9:3001/health
# Should return: {"status":"ok","timestamp":"..."}
```

### View recent logs
```bash
ssh -i luma-cookie-service.pem ubuntu@54.147.7.9
pm2 logs luma-cookie-service --lines 100
```

## Troubleshooting

### Cookie extraction fails
- Check Luma credentials in `.env`
- Review logs for specific errors: `pm2 logs luma-cookie-service`
- Ensure Chrome/Chromium is properly installed

### Service doesn't start
- Check PM2 status: `pm2 status`
- Check systemd status: `sudo systemctl status pm2-ubuntu`
- Review error logs: `pm2 logs luma-cookie-service --err`

### Cannot connect to service
- Verify security group allows traffic on port 3001
- Check if service is listening: `sudo ss -tlnp | grep 3001`
- Ensure instance is running in AWS console

## Cost Optimization

- Instance type: t2.micro (eligible for AWS free tier)
- Consider using Reserved Instances for long-term cost savings
- Monitor usage with AWS Cost Explorer

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