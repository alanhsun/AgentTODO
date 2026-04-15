const readline = require('readline');
const path = require('path');
const SkillManager = require('./SkillManager');

// 1. 初始化技能管理员，告诉他技能文件夹在哪里
const skillsDir = path.join(__dirname, 'skills');
const skillManager = new SkillManager(skillsDir);

// 加载所有技能
skillManager.loadSkills();

// 2. 创建“对讲机”（双向通信通道），监听键盘输入和屏幕输出
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'AgentTODO> '
});

console.log('====== 欢迎使用 AgentTODO CLI 交互模式 ======');
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
      skills.forEach(s => console.log(`  - ${s.name}: ${s.description}`));
      
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
          // 解析 JSON 参数
          let args = {};
          if (argsString) {
            try {
              args = JSON.parse(argsString);
            } catch (e) {
              console.log('⚠️ 错误: 参数必须是有效的 JSON 格式。');
              rl.prompt(); // 恢复提示符
              return;
            }
          }

          // 执行技能
          console.log(`[运行中] 正在执行技能 "${skillName}"...`);
          const validArgs = skill.validate(args); // 1. 验证参数
          const result = await skill.execute(validArgs); // 2. 执行逻辑
          
          // 打印结果，格式化为漂亮的 JSON 字符串
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
