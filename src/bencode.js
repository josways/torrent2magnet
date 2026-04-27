/**
 * Bencode 解析器
 * BitTorrent 协议使用的编码格式解析器，用于解析 .torrent 文件
 * 使用递归下降解析器，时间复杂度 O(n)
 */

/**
 * 从 ArrayBuffer 或 Uint8Array 获取字节
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {number} pos
 * @returns {number}
 */
function getByte(buffer, pos) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return data[pos];
}

/**
 * 解码 Bencode 数据
 * @param {ArrayBuffer|Uint8Array} buffer - 输入的 ArrayBuffer 或 Uint8Array
 * @param {number} [pos=0] - 解析起始位置
 * @returns {{ result: any, pos: number }}
 */
function decode(buffer, pos = 0) {
  const byte = getByte(buffer, pos);

  if (byte === undefined) {
    throw new Error('Bencode 解析错误：缓冲区为空或位置超出范围');
  }

  // 字符串：以数字开头，格式为 "长度:内容"
  if (byte >= 0x30 && byte <= 0x39) { // '0'-'9'
    return decodeString(buffer, pos);
  }

  // 整数：以 'i' 开头
  if (byte === 0x69) { // 'i'
    return decodeInt(buffer, pos);
  }

  // 列表：以 'l' 开头
  if (byte === 0x6C) { // 'l'
    return decodeList(buffer, pos);
  }

  // 字典：以 'd' 开头
  if (byte === 0x64) { // 'd'
    return decodeDict(buffer, pos);
  }

  throw new Error(`Bencode 解析错误：无效的格式，字节值 ${byte} (位置 ${pos})`);
}

/**
 * 解析字符串
 * 格式：长度:内容 (例如 "3:abc" 表示字符串 "abc")
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {number} pos
 * @returns {{ result: string, pos: number }}
 */
function decodeString(buffer, pos) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // 读取长度
  let lengthStr = '';
  while (pos < data.length) {
    const byte = data[pos];
    if (byte === 0x3A) { // ':'
      pos++;
      break;
    }
    if (byte < 0x30 || byte > 0x39) { // 不是数字
      throw new Error(`Bencode 解析错误：字符串长度格式无效 (位置 ${pos})`);
    }
    lengthStr += String.fromCharCode(byte);
    pos++;
  }

  if (pos >= data.length) {
    throw new Error('Bencode 解析错误：字符串长度格式不完整');
  }

  const length = parseInt(lengthStr, 10);
  if (isNaN(length) || length < 0) {
    throw new Error(`Bencode 解析错误：字符串长度无效 "${lengthStr}"`);
  }

  // 检查是否有足够的字节
  if (pos + length > data.length) {
    throw new Error(`Bencode 解析错误：字符串内容超出缓冲区范围 (位置 ${pos})`);
  }

  // 读取字符串内容
  const bytes = data.slice(pos, pos + length);
  let result;
  try {
    result = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (e) {
    // 如果 UTF-8 解码失败（比如 torrent 文件中包含非标准字符），
    // 尝试使用 Latin-1 编码作为后备方案（BitTorrent 协议常使用 Latin-1）
    result = new TextDecoder('iso-8859-1').decode(bytes);
  }

  return {
    result,
    pos: pos + length
  };
}

/**
 * 解析整数
 * 格式：i数值e (例如 "i123e" 表示整数 123)
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {number} pos
 * @returns {{ result: number, pos: number }}
 */
function decodeInt(buffer, pos) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // 检查起始 'i'
  if (data[pos] !== 0x69) { // 'i'
    throw new Error(`Bencode 解析错误：整数应以 'i' 开头 (位置 ${pos})`);
  }
  pos++;

  // 读取符号（可选）
  let sign = 1;
  if (data[pos] === 0x2D) { // '-'
    sign = -1;
    pos++;
  }

  // 读取数字
  let numStr = '';
  let hitEnd = false;
  while (pos < data.length) {
    const byte = data[pos];
    if (byte === 0x65) { // 'e'
      pos++;
      hitEnd = true;
      break;
    }
    if (byte < 0x30 || byte > 0x39) { // 不是数字
      throw new Error(`Bencode 解析错误：整数格式无效 (位置 ${pos})`);
    }
    numStr += String.fromCharCode(byte);
    pos++;
  }

  if (numStr === '') {
    throw new Error('Bencode 解析错误：整数值为空');
  }

  // 检查是否遇到了 'e'
  if (!hitEnd) {
    throw new Error('Bencode 解析错误：整数未正确关闭，缺少结尾的 \'e\'');
  }

  const result = parseInt(numStr, 10) * sign;
  if (isNaN(result)) {
    throw new Error(`Bencode 解析错误：无效的整数 "${numStr}"`);
  }

  return { result, pos };
}

/**
 * 解析列表
 * 格式：l内容e (例如 "l3:abci123ee" 表示 ["abc", 123])
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {number} pos
 * @returns {{ result: any[], pos: number }}
 */
function decodeList(buffer, pos) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // 检查起始 'l'
  if (data[pos] !== 0x6C) { // 'l'
    throw new Error(`Bencode 解析错误：列表应以 'l' 开头 (位置 ${pos})`);
  }
  pos++;

  const result = [];

  while (pos < data.length) {
    const byte = data[pos];

    // 遇到 'e' 结束列表
    if (byte === 0x65) { // 'e'
      pos++;
      break;
    }

    // 解析列表元素
    const { result: item, pos: newPos } = decode(buffer, pos);
    result.push(item);
    pos = newPos;
  }

  if (pos > data.length) {
    throw new Error('Bencode 解析错误：列表未正确关闭');
  }

  return { result, pos };
}

/**
 * 解析字典
 * 格式：d键值对e (例如 "d3:key5:valuee" 表示 {"key": "value"})
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {number} pos
 * @returns {{ result: object, pos: number }}
 */
function decodeDict(buffer, pos) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // 检查起始 'd'
  if (data[pos] !== 0x64) { // 'd'
    throw new Error(`Bencode 解析错误：字典应以 'd' 开头 (位置 ${pos})`);
  }
  pos++;

  const result = {};

  while (pos < data.length) {
    const byte = data[pos];

    // 遇到 'e' 结束字典
    if (byte === 0x65) { // 'e'
      pos++;
      break;
    }

    // 解析键（必须是字符串）
    const { result: key, pos: keyPos } = decodeString(buffer, pos);
    pos = keyPos;

    // 检查键是否重复
    if (result.hasOwnProperty(key)) {
      throw new Error(`Bencode 解析错误：字典键重复 "${key}"`);
    }

    // 解析值
    const { result: value, pos: valuePos } = decode(buffer, pos);
    result[key] = value;
    pos = valuePos;
  }

  if (pos > data.length) {
    throw new Error('Bencode 解析错误：字典未正确关闭');
  }

  return { result, pos };
}

/**
 * 查找 info 字段的起始位置
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {number|null}
 */
function findInfoStart(buffer) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const infoBytes = new TextEncoder().encode('4:info');

  for (let i = 0; i <= data.length - infoBytes.length; i++) {
    let match = true;
    for (let j = 0; j < infoBytes.length; j++) {
      if (data[i + j] !== infoBytes[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return i + infoBytes.length; // 返回 "4:info" 之后的位置
    }
  }
  return null;
}

/**
 * 计算 info 字典的结束位置
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {number} infoStart
 * @returns {number|null}
 */
function findInfoEnd(buffer, infoStart) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let depth = 0;
  let pos = infoStart;

  while (pos < data.length) {
    const byte = data[pos];

    if (byte === 0x64 || byte === 0x6C) { // 'd' or 'l'
      depth++;
      pos++;
    } else if (byte === 0x65) { // 'e'
      depth--;
      if (depth === 0) {
        return pos + 1; // 返回 'e' 之后的位置
      }
      pos++;
    } else if (byte >= 0x30 && byte <= 0x39) { // '0'-'9' 字符串
      // 读取字符串长度（在 ':' 之前的数字）
      let lenStr = '';
      while (pos < data.length && data[pos] !== 0x3A) {
        lenStr += String.fromCharCode(data[pos]);
        pos++;
      }
      pos++; // 跳过 ':'
      const len = parseInt(lenStr, 10) || 0;
      pos += len; // 跳过字符串内容
    } else if (byte === 0x69) { // 'i' 整数
      pos++; // 跳过 'i'
      if (data[pos] === 0x2D) { pos++; } // 跳过可选的负号
      while (pos < data.length && data[pos] !== 0x65) {
        pos++; // 跳过数字字符
      }
      pos++; // 跳过结尾的 'e'
    } else {
      pos++;
    }
  }

  return null;
}

/**
 * 提取 info 字段的原始数据用于 SHA-1 计算
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {{ infoBytes: Uint8Array, infoStart: number, infoEnd: number }|null}
 */
function findInfoHash(buffer, infoStart, infoEnd) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (infoStart === null || infoEnd === null) {
    return null;
  }

  if (infoStart < 0 || infoEnd > data.length || infoStart >= infoEnd) {
    return null;
  }

  const infoBytes = data.slice(infoStart, infoEnd);
  return {
    infoBytes,
    infoStart,
    infoEnd
  };
}

/**
 * 主入口函数：解码 torrent 文件
 * @param {ArrayBuffer|Uint8Array} buffer - 文件内容
 * @returns {{ data: object, infoBytes: Uint8Array|null, infoStart: number|null, infoEnd: number|null }}
 */
function decodeTorrent(buffer) {
  // 首先解码整个 torrent
  const { result, pos } = decode(buffer, 0);

  // 查找 info 字段的位置
  const infoStart = findInfoStart(buffer);
  let infoEnd = null;

  if (infoStart !== null) {
    infoEnd = findInfoEnd(buffer, infoStart);
  }

  // 提取 info 字段的原始数据
  let infoResult = null;
  if (infoStart !== null && infoEnd !== null) {
    infoResult = findInfoHash(buffer, infoStart, infoEnd);
  }

  return {
    data: result,
    infoBytes: infoResult ? infoResult.infoBytes : null,
    infoStart,
    infoEnd
  };
}

// 导出函数
export {
  decode,
  decodeString,
  decodeInt,
  decodeList,
  decodeDict,
  findInfoStart,
  findInfoEnd,
  findInfoHash,
  decodeTorrent
};

// 默认导出
export default decodeTorrent;
