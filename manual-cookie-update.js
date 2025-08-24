#!/usr/bin/env node

// Script para actualizar manualmente la cookie de Luma en la base de datos
// Uso: node manual-cookie-update.js "cookie-value"

require('dotenv').config();
const { DatabaseUpdater } = require('./src/services/database-updater');

async function updateCookie(cookieValue) {
  if (!cookieValue) {
    console.error('Por favor proporciona el valor de la cookie como argumento');
    console.error('Uso: node manual-cookie-update.js "luma.auth-session-key=xxx"');
    process.exit(1);
  }

  const updater = new DatabaseUpdater();
  
  try {
    console.log('Actualizando cookie en la base de datos...');
    
    const result = await updater.updateCookie({
      cookie: cookieValue,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días
      obtainedAt: new Date()
    });
    
    console.log('Cookie actualizada exitosamente:', result.id);
    console.log('Válida hasta:', result.expiresAt);
    
  } catch (error) {
    console.error('Error al actualizar cookie:', error);
    process.exit(1);
  } finally {
    await updater.disconnect();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  const cookieValue = process.argv[2];
  updateCookie(cookieValue);
}