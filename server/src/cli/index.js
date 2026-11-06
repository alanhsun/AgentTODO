#!/usr/bin/env node
/**
 * AgentTODO CLI
 *
 * 两种使用方式：
 * 1. 交互模式（适合人工调试）：
 *      node server/src/cli/index.js
 * 2. 单次执行模式（适合 AI / 脚本调用，stdout 只输出 JSON，失败时退出码为 1）：
 *      node server/src/cli/index.js list
 *      node server/src/cli/index.js run get_today_agenda
 *      node server/src/cli/index.js run create_task '{"title":"写报告","priority":"high"}'
 *      echo {"title":"写报告"} | node server/src/cli/index.js run create_task -
 */
const readline = require('readline');
const path = require('path');
const SkillManager = require('./SkillManager');
const { BASE_URL } = require('./config');

const skillsDir = path.join(__dirname, 'skills');

/**
 * 拆分一行命令：`run create_task {"title": "a b"}` → { command, skillName, argsString }
 * 允许命令之间存在多个空格；JSON 参数中的空格会被完整保留。
 */
function parseCommandLine(line) {
  const match = /^(\S+)(?:\s+(\S+))?(?:\s+([\s\S]*))?$/.exec(line.trim());
  if (!match) return { command: '', skillName: undefined, argsString: '' };
  return { command: match[1], skillName: match[2], argsString: (match[3] || '').trim() };
}

/** 解析 JSON 参数，空字符串视为 {} */
function parseArgs(argsString) {
  if (!argsString) return {};
  const parsed = JSON.parse(argsString);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('参数必须是 JSON 对象，例如 {"title":"写报告"}');
  }
  return parsed;
}

function isErrorResult(result) {
  return Boolean(result && typeof result === 'object' && result.status === 'error');
}

function formatSkillHelp(skill) {
  const lines = [`${skill.name}: ${skill.description}`];
  const params = skill.parameters || {};
  const keys = Object.keys(params);
  if (keys.length === 0) {
    lines.push('  (无参数)');
  } else {
    keys.forEach((k) => lines.push(`  - ${k}: ${params[k]}`));
  }
  return lines.join('\n');
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/** 单次执行模式 */
async function runOnce(argv) {
  const skillManager = new SkillManager(skillsDir, { log: null, error: (...a) => console.error(...a) });
  skillManager.loadSkills();

  const [command, skillName, ...rest] = argv;
  const print = (obj) => process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);

  if (command === 'list') {
    print(skillManager.listSkills());
    return 0;
  }

  if (command === 'run') {
    if (!skillName) {
      print({ status: 'error', message: '请指定要运行的技能名称，例如: run get_today_agenda' });
      return 1;
    }
    let args;
    try {
      const raw = rest.length === 1 && rest[0] === '-' ? await readStdin() : rest.join(' ');
      args = parseArgs(raw.trim());
    } catch (e) {
      print({ status: 'error', skill: skillName, message: `参数必须是有效的 JSON 对象: ${e.message}` });
      return 1;
    }
    const result = await skillManager.runSkill(skillName, args);
    print(result);
    return isErrorResult(result) ? 1 : 0;
  }

  console.error([
    '用法:',
    '  node server/src/cli/index.js                     进入交互模式',
    '  node server/src/cli/index.js list                以 JSON 列出所有技能及参数',
    '  node server/src/cli/index.js run <skill> [json]  执行技能并输出 JSON',
    '  node server/src/cli/index.js run <skill> -       从标准输入读取 JSON 参数',
    '',
    `当前服务地址: ${BASE_URL} (可通过 AGENTTODO_URL 环境变量修改)`,
  ].join('\n'));
  return command === 'help' || command === '--help' || command === '-h' ? 0 : 1;
}

/** 交互模式 */
function startInteractive() {
  // 1. 初始化技能管理员，告诉他技能文件夹在哪里，并加载所有技能
  const skillManager = new SkillManager(skillsDir);
  skillManager.loadSkills();

  // 2. 创建“对讲机”（双向通信通道），监听键盘输入和屏幕输出
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'AgentTODO> ',
  });

  console.log('====== 欢迎使用 AgentTODO CLI 交互模式 ======');
  console.log(`服务地址: ${BASE_URL}`);
  console.log('输入 "help" 查看所有可用命令。');
  rl.prompt();

  // 3. 当通过对讲机收到消息时（用户敲击回车）
  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return; // 如果什么都没输入，直接返回
    }

    // 拆分命令和参数
    // 假设输入：run ping {"message":"你好"}
    // command = "run", skillName = "ping", argsString = '{"message":"你好"}'
    const { command, skillName, argsString } = parseCommandLine(input);

    try {
      if (command === 'help') {
        const skill = skillName && skillManager.getSkill(skillName);
        if (skill) {
          console.log(formatSkillHelp(skill));
        } else {
          console.log('可用命令:');
          console.log('  list                 - 列出所有可用技能');
          console.log('  help <skill>         - 查看某个技能的参数说明');
          console.log('  run <skill> [json]   - 运行某个技能，参数必须是 JSON 格式');
          console.log('  reload               - 热加载所有技能（修改代码后直接生效）');
          console.log('  exit                 - 退出程序');
        }
      } else if (command === 'list') {
        const skills = skillManager.listSkills();
        console.log('可用技能列表:');
        skills.forEach((s) => console.log(`  - ${s.name}: ${s.description}`));
      } else if (command === 'reload') {
        skillManager.reloadAll();
      } else if (command === 'run') {
        if (!skillName) {
          console.log('⚠️ 错误: 请指定要运行的技能名称。例如: run ping');
        } else if (!skillManager.getSkill(skillName)) {
          console.log(`⚠️ 错误: 找不到技能 "${skillName}"。你可以输入 "list" 查看可用技能。`);
        } else {
          // 解析 JSON 参数
          let args;
          try {
            args = parseArgs(argsString);
          } catch (e) {
            console.log(`⚠️ 错误: 参数必须是有效的 JSON 对象。${e.message}`);
            rl.prompt(); // 恢复提示符
            return;
          }

          // 执行技能（校验 + 执行）
          console.log(`[运行中] 正在执行技能 "${skillName}"...`);
          const result = await skillManager.runSkill(skillName, args);

          // 打印结果，格式化为漂亮的 JSON 字符串
          console.log(isErrorResult(result) ? '[执行失败]:' : '[执行结果]:');
          console.log(JSON.stringify(result, null, 2));
        }
      } else if (command === 'exit' || command === 'quit') {
        console.log('再见！');
        process.exit(0);
      } else {
        console.log(`⚠️ 未知命令: ${command}。输入 "help" 查看帮助。`);
      }
    } catch (error) {
      // 捕获所有未处理的错误
      console.error('⚠️ [执行出错]:', error.message);
    }

    // 命令执行完毕后，重新显示提示符，等待下一次输入
    rl.prompt();
  }).on('close', () => {
    // 当用户按下 Ctrl+C 退出时
    console.log('\n再见！');
    process.exit(0);
  });
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    startInteractive();
  } else {
    runOnce(argv).then((code) => { process.exitCode = code; });
  }
}

module.exports = { parseCommandLine, parseArgs, isErrorResult, runOnce };
