const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const nodemailer = require('nodemailer');
const { getPOAPAuthManager } = require('../lib/poap-auth');
const logger = require('../utils/logger');

class DropProcessor {
  constructor() {
    this.prisma = new PrismaClient();
    this.isProcessing = false;
    
    // Email transporter
    this.emailTransporter = null;
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    }
    
    // POAP Auth Manager
    try {
      this.authManager = getPOAPAuthManager();
    } catch (error) {
      logger.error('Failed to initialize POAP auth manager:', error.message);
      this.authManager = null;
    }
  }

  async processDrops() {
    if (this.isProcessing) {
      logger.warn('Drop processing already in progress, skipping...');
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      logger.info('Starting drop processing...');

      // Check if POAP API is configured
      if (!process.env.POAP_API_KEY || process.env.POAP_API_KEY === 'placeholder_api_key') {
        logger.warn('POAP API key not configured, skipping drop processing');
        return;
      }
      
      if (!this.authManager) {
        logger.warn('POAP OAuth not configured, skipping drop processing');
        return;
      }

      // 1. Get Luma cookie
      const lumaCookie = await this.getLumaCookie();
      if (!lumaCookie) {
        logger.error('No valid Luma cookie found');
        return;
      }

      // 2. Get all active Luma drops
      const drops = await this.prisma.drop.findMany({
        where: {
          platform: 'luma',
          isActive: true,
          lumaEventId: { not: null }
        },
        include: {
          lumaGuests: true,
          lumaDeliveries: true
        }
      });

      logger.info(`Found ${drops.length} active Luma drops to process`);

      // 3. Process each drop
      let processedCount = 0;
      for (const drop of drops) {
        try {
          const processed = await this.processDrop(drop, lumaCookie.cookie);
          if (processed) processedCount++;
        } catch (error) {
          logger.error(`Error processing drop ${drop.id}:`, error);
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`Drop processing completed in ${duration}ms. Processed ${processedCount} drops.`);

    } catch (error) {
      logger.error('Drop processing failed:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  async getLumaCookie() {
    return await this.prisma.lumaCookie.findFirst({
      where: { isValid: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  async processDrop(drop, lumaCookie) {
    logger.info(`Processing drop ${drop.id} for Luma event ${drop.lumaEventId}`);

    try {
      // 1. Check if event has ended
      const eventDetails = await this.getLumaEventDetails(drop.lumaEventId, lumaCookie);
      if (!eventDetails) {
        logger.warn(`Could not fetch details for Luma event ${drop.lumaEventId}`);
        return false;
      }

      if (!this.hasEventEnded(eventDetails)) {
        logger.info(`Event ${drop.lumaEventId} has not ended yet, skipping`);
        return false;
      }

      // 2. Get checked-in guests
      const checkedInGuests = drop.lumaGuests.filter(guest => guest.checkedInAt !== null);
      logger.info(`Found ${checkedInGuests.length} checked-in guests`);

      // 3. Get available POAPs
      const availablePoaps = await this.getAvailablePoaps(drop.poapEventId, drop.poapSecretCode);
      logger.info(`Found ${availablePoaps} available POAPs`);

      // 4. Check if we have enough POAPs
      if (checkedInGuests.length > availablePoaps) {
        logger.warn(`Not enough POAPs: ${checkedInGuests.length} guests, ${availablePoaps} POAPs available`);
        return false;
      }

      // 5. Process deliveries based on delivery method
      const undeliveredGuests = checkedInGuests.filter(guest => {
        return !drop.lumaDeliveries.some(delivery => delivery.guestId === guest.guestId);
      });

      logger.info(`${undeliveredGuests.length} guests need POAP delivery`);

      if (undeliveredGuests.length === 0) {
        logger.info(`All guests already have POAPs delivered`);
        return false;
      }

      let deliveredCount = 0;
      for (const guest of undeliveredGuests) {
        try {
          if (drop.deliveryTarget === 'email') {
            await this.deliverPoapByEmail(drop, guest);
            deliveredCount++;
          } else if (drop.deliveryTarget === 'address' || drop.deliveryTarget === 'ethereum') {
            await this.deliverPoapToAddress(drop, guest);
            deliveredCount++;
          } else {
            logger.warn(`Unknown delivery target: ${drop.deliveryTarget}`);
          }
        } catch (error) {
          logger.error(`Error delivering POAP to guest ${guest.guestId}:`, error);
        }
      }

      logger.info(`Delivered POAPs to ${deliveredCount} guests`);
      
      // Check if all checked-in guests have been delivered
      const allDelivered = checkedInGuests.every(guest => 
        drop.lumaDeliveries.some(delivery => delivery.guestId === guest.guestId) ||
        undeliveredGuests.find(u => u.guestId === guest.guestId) // newly delivered
      );
      
      if (allDelivered && deliveredCount > 0) {
        // Mark drop as fully delivered
        await this.prisma.drop.update({
          where: { id: drop.id },
          data: {
            poapsDelivered: true,
            deliveredAt: new Date()
          }
        });
        logger.info(`Drop ${drop.id} marked as fully delivered`);
      }
      
      return deliveredCount > 0;

    } catch (error) {
      logger.error(`Error processing drop ${drop.id}:`, error);
      return false;
    }
  }

  async getLumaEventDetails(eventId, cookie) {
    try {
      const response = await axios.get(
        `https://api.lu.ma/event/admin/get?event_api_id=${eventId}`,
        {
          headers: {
            'Cookie': cookie,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
          }
        }
      );
      return response.data;
    } catch (error) {
      logger.error(`Error fetching Luma event ${eventId}:`, error.message);
      return null;
    }
  }

  hasEventEnded(eventDetails) {
    if (!eventDetails.event || !eventDetails.event.end_at) {
      return false;
    }
    return new Date(eventDetails.event.end_at) < new Date();
  }

  async getAvailablePoaps(eventId, secretCode) {
    try {
      if (!this.authManager) {
        logger.error('POAP auth manager not initialized');
        return 0;
      }

      const response = await this.authManager.makeAuthenticatedRequest(
        `https://api.poap.tech/event/${eventId}/qr-codes`,
        {
          method: 'POST',
          data: { secret_code: secretCode },
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-API-Key': process.env.POAP_API_KEY
          }
        }
      );

      const qrCodes = response.data;
      return qrCodes.filter(qr => !qr.claimed).length;

    } catch (error) {
      logger.error(`Error getting available POAPs for event ${eventId}:`, error.message);
      return 0;
    }
  }

  async deliverPoapByEmail(drop, guest) {
    logger.info(`Delivering POAP by email to ${guest.email}`);

    // 1. Get mint link
    const mintLink = await this.getMintLink(drop.poapEventId, drop.poapSecretCode);
    if (!mintLink) {
      throw new Error('Could not generate mint link');
    }

    // 2. Prepare email
    const emailBody = drop.emailBody || this.getDefaultEmailBody();
    const processedBody = emailBody
      .replace(/{{name}}/g, guest.name)
      .replace(/{{firstName}}/g, guest.firstName || guest.name)
      .replace(/{{mintLink}}/g, mintLink)
      .replace(/{{eventName}}/g, drop.lumaEventUrl || 'the event');

    const mailOptions = {
      from: process.env.SMTP_FROM || `${process.env.SMTP_USER}`,
      to: guest.email,
      subject: drop.emailSubject || 'Your POAP is ready!',
      html: processedBody
    };

    // 3. Send email
    if (this.emailTransporter) {
      await this.emailTransporter.sendMail(mailOptions);
      logger.info(`Email sent to ${guest.email}`);
    } else {
      logger.warn('Email transporter not configured, skipping email delivery');
      return;
    }

    // 4. Record delivery
    await this.prisma.lumaDelivery.create({
      data: {
        dropId: drop.id,
        guestId: guest.guestId,
        email: guest.email,
        name: guest.name,
        poapLink: mintLink,
        checkedInAt: guest.checkedInAt
      }
    });
  }

  async deliverPoapToAddress(drop, guest) {
    if (!guest.ethAddress) {
      logger.warn(`Guest ${guest.guestId} has no ETH address, skipping`);
      return;
    }

    logger.info(`Delivering POAP to address ${guest.ethAddress}`);

    // Get an available QR code
    const qrCode = await this.getAvailableQrCode(drop.poapEventId, drop.poapSecretCode);
    if (!qrCode) {
      throw new Error('No available QR codes');
    }

    // Claim the POAP to the address
    try {
      if (!this.authManager) {
        throw new Error('POAP auth manager not initialized');
      }

      const response = await this.authManager.makeAuthenticatedRequest(
        'https://api.poap.tech/actions/claim-qr',
        {
          method: 'POST',
          data: {
            address: guest.ethAddress,
            qr_hash: qrCode.qr_hash,
            secret: qrCode.secret,
            sendEmail: false
          },
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-API-Key': process.env.POAP_API_KEY
          }
        }
      );

      logger.info(`POAP claimed for address ${guest.ethAddress}`);

      // Record delivery
      await this.prisma.lumaDelivery.create({
        data: {
          dropId: drop.id,
          guestId: guest.guestId,
          email: guest.email,
          name: guest.name,
          poapLink: `https://poap.gallery/${guest.ethAddress}`,
          checkedInAt: guest.checkedInAt
        }
      });

    } catch (error) {
      logger.error(`Error claiming POAP for ${guest.ethAddress}:`, error.message);
      throw error;
    }
  }

  async getMintLink(eventId, secretCode) {
    try {
      if (!this.authManager) {
        logger.error('POAP auth manager not initialized');
        return null;
      }

      const response = await this.authManager.makeAuthenticatedRequest(
        `https://api.poap.tech/event/${eventId}/qr-codes`,
        {
          method: 'POST',
          data: { secret_code: secretCode },
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-API-Key': process.env.POAP_API_KEY
          }
        }
      );

      const qrCodes = response.data;
      const availableQr = qrCodes.find(qr => !qr.claimed);

      if (!availableQr) {
        return null;
      }

      // Generate mint link
      return `https://poap.xyz/claim/${availableQr.qr_hash}`;

    } catch (error) {
      logger.error(`Error getting mint link:`, error.message);
      return null;
    }
  }

  async getAvailableQrCode(eventId, secretCode) {
    try {
      if (!this.authManager) {
        logger.error('POAP auth manager not initialized');
        return null;
      }

      const response = await this.authManager.makeAuthenticatedRequest(
        `https://api.poap.tech/event/${eventId}/qr-codes`,
        {
          method: 'POST',
          data: { secret_code: secretCode },
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-API-Key': process.env.POAP_API_KEY
          }
        }
      );

      const qrCodes = response.data;
      return qrCodes.find(qr => !qr.claimed);

    } catch (error) {
      logger.error(`Error getting QR code:`, error.message);
      return null;
    }
  }

  getDefaultEmailBody() {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Hello {{firstName}}!</h2>
        <p>Thank you for attending {{eventName}}!</p>
        
        <p>Your POAP is ready to claim. Click the link below to mint your attendance token:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{mintLink}}" style="background-color: #7C65C1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Claim Your POAP
          </a>
        </div>
        
        <p>This POAP serves as a digital memory of your attendance.</p>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          If you have any questions, please don't hesitate to reach out.
        </p>
      </div>
    `;
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }
}

module.exports = { DropProcessor };