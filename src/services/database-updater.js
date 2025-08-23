const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

class DatabaseUpdater {
  constructor() {
    this.prisma = new PrismaClient();
  }

  async updateCookie(cookieData) {
    try {
      logger.info('Updating cookie in database...');
      
      // Invalidate all existing valid cookies
      await this.prisma.lumaCookie.updateMany({
        where: { isValid: true },
        data: { isValid: false }
      });
      
      // Create new cookie record
      const newCookie = await this.prisma.lumaCookie.create({
        data: {
          cookie: cookieData.cookie,
          expiresAt: cookieData.expiresAt,
          isValid: true
        }
      });
      
      logger.info(`Successfully saved cookie to database with ID: ${newCookie.id}`);
      return newCookie;
      
    } catch (error) {
      logger.error('Failed to update cookie in database:', error);
      throw error;
    }
  }

  async getCookie() {
    try {
      const latestCookie = await this.prisma.lumaCookie.findFirst({
        where: {
          isValid: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        },
        orderBy: { createdAt: 'desc' }
      });
      
      return latestCookie;
    } catch (error) {
      logger.error('Failed to fetch cookie from database:', error);
      throw error;
    }
  }

  async cleanupOldCookies() {
    try {
      // Delete cookies older than 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const result = await this.prisma.lumaCookie.deleteMany({
        where: {
          OR: [
            { isValid: false },
            { createdAt: { lt: thirtyDaysAgo } }
          ]
        }
      });
      
      if (result.count > 0) {
        logger.info(`Cleaned up ${result.count} old cookies from database`);
      }
      
      return result.count;
    } catch (error) {
      logger.error('Failed to cleanup old cookies:', error);
      // Don't throw, cleanup failures shouldn't stop the process
    }
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }
}

module.exports = { DatabaseUpdater };