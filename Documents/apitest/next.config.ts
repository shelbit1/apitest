import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    // Исправляет проблемы с native dependencies при деплое
  },
  // Настройки для production деплоя (standalone не нужен для Railway)
  
  // Правильное расположение serverExternalPackages
  serverExternalPackages: ['lightningcss'],
  
  // Исправление проблем с webpack и native modules
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('lightningcss')
    }
    return config
  }
};

export default nextConfig;
