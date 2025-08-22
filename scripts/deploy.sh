#!/bin/bash

# AWS EC2 Deployment Script for Luma Cookie Service

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
EC2_USER="ubuntu"
EC2_HOST=""
KEY_PATH=""
APP_NAME="luma-cookie-service"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --host)
            EC2_HOST="$2"
            shift 2
            ;;
        --key)
            KEY_PATH="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 --host <ec2-host> --key <path-to-key>"
            exit 1
            ;;
    esac
done

# Validate arguments
if [ -z "$EC2_HOST" ] || [ -z "$KEY_PATH" ]; then
    echo -e "${RED}Error: Missing required arguments${NC}"
    echo "Usage: $0 --host <ec2-host> --key <path-to-key>"
    exit 1
fi

echo -e "${GREEN}=== Deploying Luma Cookie Service to AWS EC2 ===${NC}"
echo "Host: $EC2_HOST"
echo "Key: $KEY_PATH"
echo ""

# Create temporary directory for deployment
TEMP_DIR=$(mktemp -d)
echo -e "${YELLOW}Creating deployment package...${NC}"

# Copy necessary files
cp -r src/ $TEMP_DIR/
cp package.json $TEMP_DIR/
cp ecosystem.config.js $TEMP_DIR/
cp .env.example $TEMP_DIR/
cp -r scripts/ $TEMP_DIR/
mkdir -p $TEMP_DIR/logs

# Create tarball
cd $TEMP_DIR
tar -czf $APP_NAME.tar.gz *
cd -

echo -e "${YELLOW}Uploading to EC2...${NC}"
scp -i "$KEY_PATH" $TEMP_DIR/$APP_NAME.tar.gz $EC2_USER@$EC2_HOST:/tmp/

# Deploy on EC2
echo -e "${YELLOW}Deploying on EC2...${NC}"
ssh -i "$KEY_PATH" $EC2_USER@$EC2_HOST << 'ENDSSH'
# Extract and install
cd /tmp
tar -xzf luma-cookie-service.tar.gz
sudo bash scripts/install-service.sh

# Clean up
rm -f luma-cookie-service.tar.gz
ENDSSH

# Clean up local temp directory
rm -rf $TEMP_DIR

echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. SSH into the EC2 instance: ${GREEN}ssh -i $KEY_PATH $EC2_USER@$EC2_HOST${NC}"
echo "2. Edit the configuration: ${GREEN}sudo nano /opt/luma-cookie-service/.env${NC}"
echo "3. Add your Vercel credentials and restart the service"
echo ""