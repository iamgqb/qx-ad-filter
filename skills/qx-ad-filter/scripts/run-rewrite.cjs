#!/usr/bin/env node
// 同步 QX 响应脚本离线测试器；@author yuecheng
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { TextEncoder, TextDecoder } = require("node:util");

function runRewrite(source, input) {
  assert.equal(typeof input.url, "string", "用例缺少 URL");
  const completed = [], effects = [];
  let jsonParseCalls = 0, jsonStringifyCalls = 0;
  function forbidden(api) {
    return function () {
      effects.push(api);
      throw new Error("禁止运行时副作用");
    };
  }
  const api = name => new Proxy({}, { get: (_, method) => forbidden(name + "." + String(method)) });
  const context = {
    $request: { url: input.url, method: input.method || "GET", headers: input.requestHeaders || {} },
    $response: {
      statusCode: input.statusCode ?? 200,
      headers: input.responseHeaders || {},
      body: typeof input.body === "string" ? input.body : JSON.stringify(input.body) ?? ""
    },
    $done(value) { completed.push(value); },
    $iCloud: api("$iCloud"), $prefs: api("$prefs"), $task: api("$task"),
    $notify: forbidden("$notify"), fetch: forbidden("fetch"),
    setTimeout: forbidden("setTimeout"), setInterval: forbidden("setInterval"),
    console: api("console"), TextEncoder, TextDecoder,
    JSON: {
      parse(...args) { jsonParseCalls++; return JSON.parse(...args); },
      stringify(...args) { jsonStringifyCalls++; return JSON.stringify(...args); }
    }
  };
  vm.runInNewContext(source, context, { timeout: 1000, filename: "qx-response.js" });
  assert.equal(effects.length, 0, "正式脚本不应有运行时副作用");
  assert.equal(completed.length, 1, "$done 必须同步调用恰好一次");
  const value = typeof completed[0] === "string" ? { body: completed[0] } : completed[0] ?? {};
  const result = JSON.parse(JSON.stringify(value));
  assert(result && typeof result === "object" && !Array.isArray(result), "回调值应为对象或正文字符串");
  if (Object.hasOwn(result, "body")) assert.equal(typeof result.body, "string", "正文应为字符串");
  return { result, jsonParseCalls, jsonStringifyCalls };
}

function runFixture(source, fixture) {
  const run = runRewrite(source, fixture.input);
  const expected = fixture.expected;
  switch (expected.mode) {
    case "passthrough":
      assert.deepEqual(run.result, {}, "应原样放行");
      break;
    case "json":
      assert.equal(typeof run.result.body, "string", "应返回改写正文");
      assert.deepEqual(JSON.parse(run.result.body), expected.body, "JSON 改写结果不符");
      break;
    case "text":
      assert.equal(run.result.body, expected.body, "正文或协议后缀不符");
      break;
    default:
      throw new Error("未知预期模式");
  }
  return run;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args.includes("--help")) {
    console.log("用法：node run-rewrite.cjs <script.js> <fixtures.json>");
    process.exitCode = args.includes("--help") ? 0 : 2;
  } else {
    try {
      const source = fs.readFileSync(args[0], "utf8");
      const fixtures = JSON.parse(fs.readFileSync(args[1], "utf8"));
      assert(Array.isArray(fixtures) && fixtures.length, "需要非空用例数组");
      let failed = 0;
      for (const fixture of fixtures) {
        try { runFixture(source, fixture); console.log("PASS " + fixture.name); }
        catch (_) { failed++; console.error("FAIL " + fixture.name + "：结果或运行约束未通过"); }
      }
      console.log(`${fixtures.length - failed}/${fixtures.length} 用例通过`);
      if (failed) process.exitCode = 1;
    } catch (_) {
      console.error("无法完成测试，请检查脚本、用例格式及文件路径。");
      process.exitCode = 1;
    }
  }
}

module.exports = { runRewrite, runFixture };
