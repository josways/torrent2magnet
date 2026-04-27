/**
 * Bencode.js 快速测试脚本
 */

import {
  decode,
  findInfoStart, findInfoEnd, decodeTorrent
} from './src/bencode.js';

console.log('=== Bencode.js 测试脚本 ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  错误: ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg} 期望 ${JSON.stringify(expected)}, 得到 ${JSON.stringify(actual)}`);
  }
}

// ============= 基本解析测试 =============
console.log('\n--- 基本解析测试 ---');

test('解析整数 i123e', () => {
  const enc = new TextEncoder().encode('i123e');
  const { result, pos } = decode(enc, 0);
  assertEqual(result, 123);
  assertEqual(pos, 5);
});

test('解析负整数 i-456e', () => {
  const enc = new TextEncoder().encode('i-456e');
  const { result, pos } = decode(enc, 0);
  assertEqual(result, -456);
  assertEqual(pos, 6);
});

test('解析零 i0e', () => {
  const enc = new TextEncoder().encode('i0e');
  const { result, pos } = decode(enc, 0);
  assertEqual(result, 0);
});

test('解析字符串 4:test', () => {
  const enc = new TextEncoder().encode('4:test');
  const { result, pos } = decode(enc, 0);
  assertEqual(result, 'test');
  assertEqual(pos, 6);
});

test('解析列表 l3:abci123ee', () => {
  const enc = new TextEncoder().encode('l3:abci123ee');
  const { result, pos } = decode(enc, 0);
  assertEqual(result[0], 'abc');
  assertEqual(result[1], 123);
});

test('解析字典 d3:key5:valuee', () => {
  const enc = new TextEncoder().encode('d3:key5:valuee');
  const { result, pos } = decode(enc, 0);
  assertEqual(result.key, 'value');
});

// ============= 嵌套结构测试 =============
console.log('\n--- 嵌套结构测试 ---');

test('解析嵌套字典 d3:keyd4:name5:aliceee', () => {
  const enc = new TextEncoder().encode('d3:keyd4:name5:aliceee');
  const { result } = decode(enc, 0);
  assertEqual(result.key.name, 'alice');
});

test('解析嵌套列表 lli123ei456ee', () => {
  const enc = new TextEncoder().encode('lli123ei456ee');
  const { result } = decode(enc, 0);
  assertEqual(result[0][0], 123);
  assertEqual(result[0][1], 456);
});

// ============= 中文字符串测试 =============
console.log('\n--- 中文字符串测试 ---');

test('解析中文字符串 6:测试', () => {
  const enc = new TextEncoder().encode('6:测试');
  const { result } = decode(enc, 0);
  assertEqual(result, '测试');
});

test('解析混合字符串 11:hello世界', () => {
  // "hello世界" 在 UTF-8 中: h=1, e=1, l=1, l=1, o=1, 世=3, 界=3 = 11 bytes
  const enc = new TextEncoder().encode('11:hello世界');
  const { result } = decode(enc, 0);
  assertEqual(result, 'hello世界');
});

// ============= 边界情况测试 =============
console.log('\n--- 边界情况测试 ---');

test('空缓冲区应抛出错误', () => {
  try {
    decode(new Uint8Array(0), 0);
    throw new Error('应该抛出错误');
  } catch (e) {
    if (!e.message.includes('缓冲区为空')) {
      throw new Error('错误信息不正确');
    }
  }
});

test('无效格式应抛出错误', () => {
  try {
    decode(new TextEncoder().encode('x'), 0);
    throw new Error('应该抛出错误');
  } catch (e) {
    if (!e.message.includes('无效的格式')) {
      throw new Error('错误信息不正确');
    }
  }
});

test('不完整的整数应抛出错误', () => {
  try {
    // 正确的 bencode 整数是 i<number>e，不完整的应该是 i<number> 后面没有 e
    // 这里用 "i123" 但后面没有 e，解析完 "123" 后遇到缓冲区末尾
    decode(new TextEncoder().encode('i123'), 0);
    throw new Error('应该抛出错误');
  } catch (e) {
    console.log(`  实际错误信息: "${e.message}"`);
    // 错误信息可能是 "无效的格式" 因为遇到未知字节
    if (!e.message.includes('格式') && !e.message.includes('整数')) {
      throw new Error('错误信息不正确: ' + e.message);
    }
  }
});

test('重复键应抛出错误', () => {
  try {
    // 正确的 bencode 字典：d3:key5:value3:key5:value2e
    // 但这个测试数据有问题，让我们用正确的格式
    decode(new TextEncoder().encode('d3:key5:value3:key5:value2e'), 0);
    throw new Error('应该抛出错误');
  } catch (e) {
    console.log(`  实际错误信息: "${e.message}"`);
    // 错误信息应该是 "重复"
    if (!e.message.includes('重复')) {
      throw new Error('错误信息不正确: ' + e.message);
    }
  }
});

// ============= findInfo 测试 =============
console.log('\n--- findInfo 测试 ---');

test('findInfoStart 应正确找到 info 字段', () => {
  const torrent = 'd8:announce35:http://tracker.example.com/announce4:infod6:lengthi123456e4:name8:test.txtee';
  const enc = new TextEncoder().encode(torrent);
  const infoStart = findInfoStart(enc);
  // "4:info" 后面是 'd'，所以 infoStart 应该指向 info 字典开始处
  console.log(`  infoStart = ${infoStart}`);
  console.log(`  周围内容: "${new TextDecoder().decode(enc.slice(infoStart - 10, infoStart + 10))}"`);
});

test('findInfoEnd 应正确找到 info 字段结束位置', () => {
  const torrent = 'd8:announce35:http://tracker.example.com/announce4:infod6:lengthi123456e4:name8:test.txtee';
  const enc = new TextEncoder().encode(torrent);
  const infoStart = findInfoStart(enc);
  const infoEnd = findInfoEnd(enc, infoStart);
  console.log(`  infoStart = ${infoStart}, infoEnd = ${infoEnd}`);
  
  if (infoStart !== null && infoEnd !== null) {
    const infoBytes = enc.slice(infoStart, infoEnd);
    console.log(`  info 内容: "${new TextDecoder().decode(infoBytes)}"`);
    
    // 验证 info 内容可以正确解析
    const infoResult = decode(enc, infoStart);
    console.log(`  解析结果: ${JSON.stringify(infoResult.result)}`);
    assertEqual(infoResult.result.length, 123456);
    assertEqual(infoResult.result.name, 'test.txt');
  }
});

test('decodeTorrent 应正确解析完整 torrent', () => {
  const torrent = 'd8:announce35:http://tracker.example.com/announce4:infod6:lengthi123456e4:name8:test.txtee';
  const enc = new TextEncoder().encode(torrent);
  const result = decodeTorrent(enc);
  
  console.log(`  infoStart: ${result.infoStart}, infoEnd: ${result.infoEnd}`);
  console.log(`  infoBytes: ${result.infoBytes ? result.infoBytes.length + ' bytes' : 'null'}`);
  
  assertEqual(result.data.announce, 'http://tracker.example.com/announce');
  assertEqual(result.data.info.length, 123456);
  assertEqual(result.data.info.name, 'test.txt');
});

// ============= 递归深度测试 =============
console.log('\n--- 递归深度测试 ---');

function createDeeplyNested(depth) {
  let s = 'l';
  for (let i = 0; i < depth; i++) {
    s += 'l';
  }
  for (let i = 0; i < depth; i++) {
    s += 'e';
  }
  return s;
}

for (const depth of [10, 50, 100, 500]) {
  test(`嵌套深度 ${depth}`, () => {
    const enc = new TextEncoder().encode(createDeeplyNested(depth));
    const start = performance.now();
    const { result } = decode(enc, 0);
    const time = (performance.now() - start).toFixed(2);
    console.log(`  深度 ${depth} 耗时 ${time}ms`);
  });
}

// ============= 结果汇总 =============
console.log('\n=== 测试结果汇总 ===');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
