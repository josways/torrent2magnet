/**
 * Magnet URI 生成器
 * 基于 Bencode 解析后的数据，生成标准 BitTorrent Magnet URI
 */

/**
 * 计算 SHA-1 哈希
 * @param {ArrayBuffer|Uint8Array} buffer - 输入数据
 * @returns {Promise<ArrayBuffer>} SHA-1 哈希结果
 */
async function sha1(buffer) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return crypto.subtle.digest('SHA-1', data);
}

/**
 * 将 ArrayBuffer 转换为十六进制字符串
 * @param {ArrayBuffer} buffer - 输入数据
 * @returns {string} 十六进制字符串
 */
function toHex(buffer) {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 安全的 URL 编码（保留 torrent 文件名中的非法 URI 字符）
 * @param {string} str - 输入字符串
 * @returns {string} URL 编码后的字符串
 */
function encodeURIComponentSafe(str) {
  try {
    return encodeURIComponent(str);
  } catch (e) {
    // 如果编码失败，使用手动编码
    return str.split('').map(char => {
      if (/[A-Za-z0-9\-_.~]/.test(char)) {
        return char;
      }
      return '%' + char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
    }).join('');
  }
}

/**
 * 计算 torrent 总文件大小
 * @param {object} info - info 字典
 * @returns {number} 总大小（字节）
 */
function calculateTotalSize(info) {
  if (info.length !== undefined) {
    // 单文件 torrent
    return info.length;
  }

  if (info.files) {
    // 多文件 torrent
    return info.files.reduce((sum, file) => sum + (file.length || 0), 0);
  }

  return 0;
}

/**
 * 提取并去重 tracker URL
 * @param {object} torrentData - 解码后的 torrent 数据
 * @returns {string[]} tracker URL 数组
 */
function extractTrackers(torrentData) {
  const trackers = new Set();

  // 优先使用 announce-list（数组结构）
  if (Array.isArray(torrentData['announce-list'])) {
    for (const tier of torrentData['announce-list']) {
      if (Array.isArray(tier)) {
        for (const tracker of tier) {
          if (typeof tracker === 'string' && tracker.trim()) {
            trackers.add(tracker.trim());
          }
        }
      } else if (typeof tier === 'string' && tier.trim()) {
        trackers.add(tier.trim());
      }
    }
  }

  // 回退到 announce（字符串）
  if (torrentData.announce && typeof torrentData.announce === 'string') {
    const announce = torrentData.announce.trim();
    if (announce) {
      trackers.add(announce);
    }
  }

  return Array.from(trackers);
}

/**
 * 生成 Magnet URI
 * @param {object} torrentData - 解码后的 torrent 数据（来自 bencode.decodeTorrent）
 * @param {Uint8Array} infoBytes - info 字段的原始 bencode 数据（用于计算 SHA-1）
 * @returns {Promise<string>} Magnet URI
 * @throws {Error} 当缺少必要字段或计算失败时抛出错误
 */
async function generateMagnet(torrentData, infoBytes) {
  // 验证输入
  if (!torrentData || typeof torrentData !== 'object') {
    throw new Error('Magnet 生成错误：无效的 torrent 数据');
  }

  if (!infoBytes || !(infoBytes instanceof Uint8Array)) {
    throw new Error('Magnet 生成错误：缺少 info 字段的原始数据');
  }

  const info = torrentData.info;
  if (!info) {
    throw new Error('Magnet 生成错误：torrent 数据中缺少 info 字段');
  }

  // 计算 InfoHash（SHA-1）
  let infoHash;
  try {
    const hashBuffer = await sha1(infoBytes);
    infoHash = toHex(hashBuffer);
  } catch (e) {
    throw new Error(`Magnet 生成错误：SHA-1 计算失败 - ${e.message}`);
  }

  if (infoHash.length !== 40) {
    throw new Error('Magnet 生成错误：计算的 InfoHash 长度不正确');
  }

  // 提取显示名称
  const displayName = info.name;
  if (!displayName) {
    throw new Error('Magnet 生成错误：info 字段中缺少 name');
  }

  // 计算总文件大小
  const totalSize = calculateTotalSize(info);

  // 提取 trackers
  const trackers = extractTrackers(torrentData);

  // 构建 Magnet URI
  const params = [];

  // xt = urn:btih:InfoHash
  params.push(`xt=urn:btih:${infoHash}`);

  // dn = 显示名称（URL 编码）
  params.push(`dn=${encodeURIComponentSafe(displayName)}`);

  // xl = 总文件大小
  params.push(`xl=${totalSize}`);

  // tr = tracker URL（多个）
  for (const tracker of trackers) {
    params.push(`tr=${encodeURIComponentSafe(tracker)}`);
  }

  return `magnet:?${params.join('&')}`;
}

// 导出函数
export {
  generateMagnet,
  sha1,
  toHex,
  encodeURIComponentSafe,
  calculateTotalSize,
  extractTrackers
};

// 默认导出
export default generateMagnet;
