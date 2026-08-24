const readline = require('readline');
const path = require('path');
const SkillManager = require('./SkillManager');

const skillsDir = path.join(__dirname, 'skills');
const skillManager = new SkillManager(skillsDir);
skillManager.loadSkills();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'AgentTODO> ',
});

console.log('====== 欢迎使用 AgentTODO CLI 交互模式 ======');
console.log('输入 "help" 查看所有可用命令。');
rl.prompt();

rl.on('line', async (line) => {
  const input = line.trim();
  if (!input) {
    rl.prompt();
    return;
  }

  const parts = input.split(' ');
  const command = parts[0];
  const skillName = parts[1];
  const argsString = parts.slice(2).join(' ');

  try {
    if (command === 'help') {
      console.log('可用命令:');
      console.log('  list                 - 列出所有可用技能');
      console.log('  run <skill> [json]   - 运行某个技能，参数必须是 JSON 格式');
      console.log('  reload               - 热加载所有技能（修改代码后直接生效）');
      console.log('  exit                 - 退出程序');
    } else if (command === 'list') {
      const skills = skillManager.listSkills();
      console.log('可用技能列表:');
      skills.forEach((skill) => console.log(`  - ${skill.name}: ${skill.description}`));
    } else if (command === 'reload') {
      skillManager.reloadAll();
    } else if (command === 'run') {
      if (!skillName) {
        console.log('⚠️ 错误: 请指定要运行的技能名称。例如: run ping');
      } else {
        const skill = skillManager.getSkill(skillName);
        if (!skill) {
          console.log(`⚠️ 错误: 找不到技能 "${skillName}"。你可以输入 "list" 查看可用技能。`);
        } else {
          let args = {};
          if (argsString) {
            try {
              args = JSON.parse(argsString);
            } catch (_error) {
              console.log('⚠️ 错误: 参数必须是有效的 JSON 格式。');
              rl.prompt();
              return;
            }
          }

          console.log(`[运行中] 正在执行技能 "${skillName}"...`);
          const validArgs = skill.validate(args);
          const result = await skill.execute(validArgs);

          console.log('[执行结果]:');
          console.log(JSON.stringify(result, null, 2));
        }
      }
    } else if (command === 'exit') {
      console.log('再见！');
      process.exit(0);
    } else {
      console.log(`⚠️ 未知命令: ${command}。输入 "help" 查看帮助。`);
    }
  } catch (error) {
    console.error('⚠️ [执行出错]:', error.message);
  }

  rl.prompt();
}).on('close', () => {
  console.log('\n再见！');
  process.exit(0);
});
