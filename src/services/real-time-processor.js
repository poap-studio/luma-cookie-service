const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const nodemailer = require('nodemailer');
const { getPOAPAuthManager } = require('../lib/poap-auth');
const logger = require('../utils/logger');

class RealTimeProcessor {
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

  async processRealTimeDrops() {
    if (this.isProcessing) {
      logger.warn('Real-time processing already in progress, skipping...');
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      logger.info('Starting real-time drop processing...');

      // Check if POAP API is configured
      if (!process.env.POAP_API_KEY || process.env.POAP_API_KEY === 'placeholder_api_key') {
        logger.warn('POAP API key not configured, skipping real-time processing');
        return;
      }
      
      if (!this.authManager) {
        logger.warn('POAP OAuth not configured, skipping real-time processing');
        return;
      }

      // 1. Get Luma cookie
      const lumaCookie = await this.getLumaCookie();
      if (!lumaCookie) {
        logger.error('No valid Luma cookie found');
        return;
      }

      // 2. Get all active real-time Luma drops
      const drops = await this.prisma.drop.findMany({
        where: {
          platform: 'luma',
          isActive: true,
          isRealTime: true,
          lumaEventId: { not: null }
        },
        include: {
          lumaGuests: true,
          lumaDeliveries: true
        }
      });

      logger.info(`Found ${drops.length} active real-time Luma drops to process`);

      // 3. Process each drop
      let processedCount = 0;
      for (const drop of drops) {
        try {
          const processed = await this.processRealTimeDrop(drop, lumaCookie.cookie);
          if (processed) processedCount++;
        } catch (error) {
          logger.error(`Error processing real-time drop ${drop.id}:`, error);
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`Real-time processing completed in ${duration}ms. Processed ${processedCount} drops.`);

    } catch (error) {
      logger.error('Real-time processing failed:', error);
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

  async processRealTimeDrop(drop, lumaCookie) {
    logger.info(`Processing real-time drop ${drop.id} for Luma event ${drop.lumaEventId}`);

    try {
      // 1. Get event details to check if it's ongoing
      const eventDetails = await this.getLumaEventDetails(drop.lumaEventId, lumaCookie);
      if (!eventDetails) {
        logger.warn(`Could not fetch details for Luma event ${drop.lumaEventId}`);
        return false;
      }

      // Check if event is currently happening
      if (!this.isEventOngoing(eventDetails)) {
        logger.info(`Event ${drop.lumaEventId} is not currently ongoing`);
        return false;
      }

      // Store event name for later use in email
      const eventName = eventDetails.event?.name || drop.lumaEventUrl || 'the event';

      // 2. Find guests who checked in but haven't received POAP
      const newlyCheckedInGuests = await this.findNewlyCheckedInGuests(drop);
      
      if (newlyCheckedInGuests.length === 0) {
        logger.debug(`No new check-ins for drop ${drop.id}`);
        return false;
      }

      logger.info(`Found ${newlyCheckedInGuests.length} newly checked-in guests`);

      // 3. Get available POAPs
      const availablePoaps = await this.getAvailablePoaps(drop.poapEventId, drop.poapSecretCode);
      logger.info(`Found ${availablePoaps} available POAPs`);

      // 4. Check if we have enough POAPs
      if (newlyCheckedInGuests.length > availablePoaps) {
        logger.warn(`Not enough POAPs for real-time delivery: ${newlyCheckedInGuests.length} guests, ${availablePoaps} POAPs available`);
        return false;
      }

      // 5. Deliver POAPs to newly checked-in guests
      let deliveredCount = 0;
      for (const guest of newlyCheckedInGuests) {
        try {
          if (drop.deliveryTarget === 'email') {
            await this.deliverPoapByEmail(drop, guest, eventName);
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

      logger.info(`Delivered POAPs to ${deliveredCount} guests in real-time`);
      return deliveredCount > 0;

    } catch (error) {
      logger.error(`Error processing real-time drop ${drop.id}:`, error);
      return false;
    }
  }

  async findNewlyCheckedInGuests(drop) {
    // Find guests who have checked in but don't have a delivery record
    const checkedInGuests = drop.lumaGuests.filter(guest => 
      guest.checkedInAt !== null &&
      !drop.lumaDeliveries.some(delivery => delivery.guestId === guest.guestId)
    );

    return checkedInGuests;
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

  isEventOngoing(eventDetails) {
    if (!eventDetails.event || !eventDetails.event.start_at) {
      return false;
    }
    
    const now = new Date();
    const startTime = new Date(eventDetails.event.start_at);
    const endTime = eventDetails.event.end_at ? new Date(eventDetails.event.end_at) : null;
    
    // Event is ongoing if it has started and hasn't ended yet
    if (startTime > now) {
      return false; // Event hasn't started
    }
    
    if (endTime && endTime < now) {
      return false; // Event has ended
    }
    
    return true; // Event is ongoing
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

  async deliverPoapByEmail(drop, guest, eventName) {
    logger.info(`Delivering POAP by email to ${guest.email} (real-time)`);

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
      .replace(/{{poapLink}}/g, mintLink)
      .replace(/{{eventName}}/g, eventName);

    // Also replace variables in subject
    const processedSubject = (drop.emailSubject || 'Your POAP is ready!')
      .replace(/{{eventName}}/g, eventName)
      .replace(/{{name}}/g, guest.name)
      .replace(/{{firstName}}/g, guest.firstName || guest.name);

    const mailOptions = {
      from: process.env.SMTP_FROM || `${process.env.SMTP_USER}`,
      to: guest.email,
      subject: processedSubject,
      html: processedBody
    };

    // 3. Send email
    if (this.emailTransporter) {
      await this.emailTransporter.sendMail(mailOptions);
      logger.info(`Email sent to ${guest.email} (real-time)`);
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

    logger.info(`Delivering POAP to address ${guest.ethAddress} (real-time)`);

    try {
      if (!this.authManager) {
        throw new Error('POAP auth manager not initialized');
      }

      // Step 1: Get available QR hashes
      logger.info(`[POAP Delivery] Step 1: Getting available QR hashes...`);
      const qrHashesResponse = await this.authManager.makeAuthenticatedRequest(
        `https://api.poap.tech/event/${drop.poapEventId}/qr-codes`,
        {
          method: 'POST',
          data: { secret_code: drop.poapSecretCode },
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-API-Key': process.env.POAP_API_KEY
          }
        }
      );

      const qrCodes = qrHashesResponse.data;
      const availableQr = qrCodes.find(qr => !qr.claimed);

      if (!availableQr) {
        throw new Error('No available QR codes');
      }

      logger.info(`[POAP Delivery] Using QR hash: ${availableQr.qr_hash}`);

      // Step 2: Get the secret for this QR hash
      logger.info(`[POAP Delivery] Step 2: Getting QR secret...`);
      const secretResponse = await this.authManager.makeAuthenticatedRequest(
        `https://api.poap.tech/actions/claim-qr?qr_hash=${availableQr.qr_hash}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'X-API-Key': process.env.POAP_API_KEY
          }
        }
      );

      const qrSecret = secretResponse.data.secret;
      logger.info(`[POAP Delivery] Got QR secret`);

      // Step 3: Claim the POAP with the secret
      logger.info(`[POAP Delivery] Step 3: Claiming POAP...`);
      const claimResponse = await this.authManager.makeAuthenticatedRequest(
        `https://api.poap.tech/event/${drop.poapEventId}/qr-codes`,
        {
          method: 'POST',
          data: {
            secret_code: qrSecret,
            address: guest.ethAddress,
            sendEmail: false
          },
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-API-Key': process.env.POAP_API_KEY
          }
        }
      );

      logger.info(`POAP claimed for address ${guest.ethAddress} (real-time)`);

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

  getDefaultEmailBody() {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Hello {{firstName}}!</h2>
        <p>Thank you for checking in at {{eventName}}!</p>
        
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

module.exports = { RealTimeProcessor };