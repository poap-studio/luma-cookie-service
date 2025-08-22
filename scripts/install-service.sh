#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Luma Cookie Service Installation Script ===${NC}"
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root or with sudo${NC}"
    exit 1
fi

# Update system
echo -e "${YELLOW}Updating system packages...${NC}"
apt-get update -y

# Install required system dependencies
echo -e "${YELLOW}Installing system dependencies...${NC}"
apt-get install -y \
    curl \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils

# Install Node.js 18.x
echo -e "${YELLOW}Installing Node.js 18.x...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Verify Node.js installation
node_version=$(node -v)
npm_version=$(npm -v)
echo -e "${GREEN}Node.js installed: $node_version${NC}"
echo -e "${GREEN}npm installed: $npm_version${NC}"

# Install PM2 globally
echo -e "${YELLOW}Installing PM2...${NC}"
npm install -g pm2

# Create application user
echo -e "${YELLOW}Creating application user...${NC}"
if ! id -u luma-service > /dev/null 2>&1; then
    useradd -m -s /bin/bash luma-service
    echo -e "${GREEN}User 'luma-service' created${NC}"
else
    echo -e "${YELLOW}User 'luma-service' already exists${NC}"
fi

# Set up application directory
APP_DIR="/opt/luma-cookie-service"
echo -e "${YELLOW}Setting up application directory at $APP_DIR...${NC}"

# Create directory if it doesn't exist
mkdir -p $APP_DIR
mkdir -p $APP_DIR/logs

# Copy application files (assuming script is run from project root)
cp -r src/ $APP_DIR/
cp package.json $APP_DIR/
cp ecosystem.config.js $APP_DIR/

# Set ownership
chown -R luma-service:luma-service $APP_DIR

# Install dependencies as the application user
echo -e "${YELLOW}Installing application dependencies...${NC}"
cd $APP_DIR
sudo -u luma-service npm install --production

# Create .env file if it doesn't exist
if [ ! -f "$APP_DIR/.env" ]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    cp .env.example .env 2>/dev/null || touch .env
    chown luma-service:luma-service .env
    chmod 600 .env
    echo -e "${RED}IMPORTANT: Edit $APP_DIR/.env with your configuration${NC}"
fi

# Set up PM2 to run as the application user
echo -e "${YELLOW}Setting up PM2 startup script...${NC}"
sudo -u luma-service bash -c "cd $APP_DIR && pm2 startup systemd -u luma-service --hp /home/luma-service" | tail -n 1 | bash

# Start the application with PM2
echo -e "${YELLOW}Starting application with PM2...${NC}"
sudo -u luma-service bash -c "cd $APP_DIR && pm2 start ecosystem.config.js"
sudo -u luma-service pm2 save

# Set up log rotation
echo -e "${YELLOW}Setting up log rotation...${NC}"
cat > /etc/logrotate.d/luma-cookie-service << EOF
$APP_DIR/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 luma-service luma-service
    sharedscripts
    postrotate
        sudo -u luma-service pm2 reloadLogs
    endscript
}
EOF

# Create systemd service for additional reliability
echo -e "${YELLOW}Creating systemd service...${NC}"
cat > /etc/systemd/system/luma-cookie-service.service << EOF
[Unit]
Description=Luma Cookie Service
After=network.target

[Service]
Type=forking
User=luma-service
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/pm2 start ecosystem.config.js
ExecReload=/usr/bin/pm2 reload ecosystem.config.js
ExecStop=/usr/bin/pm2 stop ecosystem.config.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable the service
systemctl daemon-reload
systemctl enable luma-cookie-service

echo ""
echo -e "${GREEN}=== Installation Complete ===${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Edit the configuration file: ${GREEN}nano $APP_DIR/.env${NC}"
echo "2. Add your Vercel token, project ID, and other settings"
echo "3. Restart the service: ${GREEN}sudo -u luma-service pm2 restart luma-cookie-service${NC}"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "- View logs: ${GREEN}sudo -u luma-service pm2 logs luma-cookie-service${NC}"
echo "- Check status: ${GREEN}sudo -u luma-service pm2 status${NC}"
echo "- Restart service: ${GREEN}sudo -u luma-service pm2 restart luma-cookie-service${NC}"
echo "- Manual cookie update: ${GREEN}sudo -u luma-service pm2 sendSignal SIGUSR2 luma-cookie-service${NC}"
echo ""
echo -e "${GREEN}Service is now running and will update the cookie daily at 2 AM${NC}"