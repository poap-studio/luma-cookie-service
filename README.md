# Luma Cookie Service

Automated service to renew Luma session cookies for the POAP platform. This service runs on AWS EC2 and updates the cookie in Vercel every 24 hours.

## Features

- Automated cookie extraction using Puppeteer
- Daily renewal at 2 AM
- Automatic restart on failure
- Vercel environment variable updates
- Webhook notifications
- PM2 process management
- Systemd service integration

## Installation

### Prerequisites

- Ubuntu 20.04+ EC2 instance
- Node.js 18.x
- sudo access

### Quick Install

1. SSH into your EC2 instance
2. Clone this repository
3. Run the installation script:

```bash
sudo bash scripts/install-service.sh
```

### Configuration

Edit the environment variables:

```bash
sudo nano /opt/luma-cookie-service/.env
```

Required variables:
- `LUMA_EMAIL`: Luma account email (default: admin@poap.fr)
- `LUMA_PASSWORD`: Luma account password
- `VERCEL_TOKEN`: Your Vercel API token
- `VERCEL_PROJECT_ID`: Your Vercel project ID

Optional:
- `WEBHOOK_URL`: URL to notify on cookie updates
- `WEBHOOK_SECRET`: Secret for webhook authentication

### Management Commands

View logs:
```bash
sudo -u luma-service pm2 logs luma-cookie-service
```

Check status:
```bash
sudo -u luma-service pm2 status
```

Restart service:
```bash
sudo -u luma-service pm2 restart luma-cookie-service
```

Manual cookie update:
```bash
sudo -u luma-service pm2 sendSignal SIGUSR2 luma-cookie-service
```

## Architecture

- **PM2**: Process management and auto-restart
- **Systemd**: System service integration
- **Puppeteer**: Browser automation for cookie extraction
- **Node-cron**: Scheduled tasks
- **Winston**: Logging

## Logs

Logs are stored in `/opt/luma-cookie-service/logs/`:
- `combined.log`: All logs
- `error.log`: Error logs only
- `pm2-*.log`: PM2 process logs

Log rotation is configured to keep 14 days of logs.

## Security

- Service runs as dedicated `luma-service` user
- Environment variables are protected (600 permissions)
- Logs are rotated automatically
- No sensitive data in logs

## Troubleshooting

### Cookie extraction fails
- Check Luma credentials in `.env`
- Review logs for specific errors
- Ensure EC2 has internet access

### Vercel update fails
- Verify Vercel token and project ID
- Check Vercel API permissions
- Review error logs

### Service doesn't start
- Check systemd status: `systemctl status luma-cookie-service`
- Review PM2 logs
- Ensure all dependencies are installed