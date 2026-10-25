const assert = require('node:assert/strict');
const fs = require('node:fs');
const { Readable } = require('node:stream');
const { test } = require('node:test');
const { resolveChannelTextBody } = require('../dist/channel/text-body.js');

const required = { required: true, missingMessage: 'missing', emptyMessage: 'empty' };

function stdin(t, chunks) {
  // 保留每个 Buffer 的边界，稳定复现管道把一个 UTF-8 字符分两次送达。
  const input = Readable.from(chunks, { objectMode: false });
  t.mock.getter(process, 'stdin', () => input);
  return input;
}

for (const text of ['你好', '🙂']) {
  const bytes = Buffer.from(text);
  for (let split = 1; split < bytes.length; split++) {
    test(`stdin preserves ${text} split at byte ${split}`, async (t) => {
      stdin(t, [bytes.subarray(0, split), bytes.subarray(split)]);
      assert.equal(await resolveChannelTextBody({ stdin: true }, required), text);
    });
  }
}

test('stdin preserves mixed text delivered one byte at a time and trims only the end', async (t) => {
  const text = '  hello 你好，测试🙂\n';
  stdin(t, Array.from(Buffer.from(text), (byte) => Buffer.from([byte])));
  assert.equal(await resolveChannelTextBody({ stdin: true }, required), text.trimEnd());
});

test('stdin preserves ASCII and interior newlines', async (t) => {
  stdin(t, [Buffer.from('  hello\n'), Buffer.from('world\r\n')]);
  assert.equal(await resolveChannelTextBody({ stdin: true }, required), '  hello\nworld');
});

test('stdin flushes an incomplete UTF-8 sequence at EOF', async (t) => {
  const bytes = Buffer.from([0xe4, 0xbd]);
  stdin(t, [bytes.subarray(0, 1), bytes.subarray(1)]);
  assert.equal(await resolveChannelTextBody({ stdin: true }, required), bytes.toString('utf8'));
});

for (const text of ['', ' \r\n\t']) {
  test(`stdin rejects empty input ${JSON.stringify(text)}`, async (t) => {
    stdin(t, text ? [Buffer.from(text)] : []);
    await assert.rejects(resolveChannelTextBody({ stdin: true }, required), /^Error: empty$/);
  });
}

test('stdin propagates read errors', async (t) => {
  const error = new Error('read failed');
  const input = new Readable({ read() { this.destroy(error); } });
  t.mock.getter(process, 'stdin', () => input);
  await assert.rejects(resolveChannelTextBody({ stdin: true }, required), (e) => e === error);
});

test('text and text-file keep their precedence over stdin', async () => {
  assert.equal(await resolveChannelTextBody({ text: '  你好🙂\n', textFile: __filename, stdin: true }, required), '  你好🙂');
  assert.equal(await resolveChannelTextBody({ textFile: __filename, stdin: true }, required), fs.readFileSync(__filename, 'utf8').trimEnd());
  assert.equal(await resolveChannelTextBody({}, { ...required, required: false }), undefined);
  await assert.rejects(resolveChannelTextBody({}, required), /^Error: missing$/);
});
