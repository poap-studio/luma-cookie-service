#!/bin/bash

# Deploy script for luma-cookie-service

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting deployment of luma-cookie-service...${NC}"

# Check if required environment variables are set
if [ -z "$SSH_KEY_PATH" ]; then
    echo -e "${RED}Error: SSH_KEY_PATH environment variable not set${NC}"
    echo "Please set: export SSH_KEY_PATH=/path/to/luma-cookie-service.pem"
    exit 1
fi

# EC2 Instance details
EC2_IP="54.147.7.9"
EC2_USER="ubuntu"
SERVICE_DIR="/home/ubuntu/luma-cookie-service"

# Ensure SSH key has correct permissions
chmod 600 "$SSH_KEY_PATH"

echo -e "${GREEN}1. Connecting to EC2 instance...${NC}"

# Create deployment script that will run on the server
cat << 'REMOTE_SCRIPT' > /tmp/deploy_remote.sh
#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Starting deployment on server...${NC}"

# Navigate to service directory
cd /home/ubuntu/luma-cookie-service || {
    echo -e "${RED}Error: Service directory not found${NC}"
    exit 1
}

# Check if it's a new installation or update
if [ ! -d ".git" ]; then
    echo -e "${GREEN}New installation detected. Cloning repository...${NC}"
    cd /home/ubuntu
    git clone https://github.com/gotoalberto/luma-cookie-service.git
    cd luma-cookie-service
else
    echo -e "${GREEN}Updating existing installation...${NC}"
    git fetch origin
    git reset --hard origin/master
fi

# Install dependencies
echo -e "${GREEN}Installing dependencies...${NC}"
npm install

# Copy .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo -e "${GREEN}Creating .env file...${NC}"
    cat > .env << 'EOF'
# Luma Credentials
LUMA_EMAIL=admin@poap.fr
LUMA_PASSWORD=!q*g%@TP7w^q

# Database URL (from poap-farcaster-saas)
DATABASE_URL="postgresql://postgres:AATDbEXO1K@poap-farcaster-db.cuayvp8dpvrg.us-east-1.rds.amazonaws.com:5432/postgres"

# PM2 Process Name
PM2_NAME=luma-cookie-service
EOF
fi

# Generate Prisma client
echo -e "${GREEN}Generating Prisma client...${NC}"
npx prisma generate

# Create ecosystem.config.js if it doesn't exist
if [ ! -f "ecosystem.config.js" ]; then
    echo -e "${GREEN}Creating PM2 ecosystem config...${NC}"
    cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'luma-cookie-service',
    script: './src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    time: true
  }]
};
EOF
fi

# Create logs directory
mkdir -p logs

# Check if PM2 is running the service
if pm2 list | grep -q "luma-cookie-service"; then
    echo -e "${GREEN}Restarting service with PM2...${NC}"
    pm2 restart luma-cookie-service
else
    echo -e "${GREEN}Starting service with PM2...${NC}"
    pm2 start ecosystem.config.js
    pm2 save
fi

# Show service status
echo -e "${GREEN}Service status:${NC}"
pm2 status

echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${GREEN}To view logs: pm2 logs luma-cookie-service${NC}"
REMOTE_SCRIPT

# Copy and execute the deployment script on the server
echo -e "${GREEN}2. Deploying to server...${NC}"
scp -i "$SSH_KEY_PATH" /tmp/deploy_remote.sh "$EC2_USER@$EC2_IP:/tmp/"
ssh -i "$SSH_KEY_PATH" "$EC2_USER@$EC2_IP" "chmod +x /tmp/deploy_remote.sh && /tmp/deploy_remote.sh"

# Cleanup
rm /tmp/deploy_remote.sh

echo -e "${GREEN}Deployment completed!${NC}"
echo -e "${GREEN}To check service status:${NC}"
echo "ssh -i $SSH_KEY_PATH $EC2_USER@$EC2_IP 'pm2 status'"