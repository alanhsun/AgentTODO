const fs = require('fs');
const path = require('path');

describe('文档结构自动化测试', () => {
  const docsDir = path.resolve(__dirname, '../../../../'); // 根目录
  
  // 要测试的文档列表
  const docFiles = [
    'README.md',
    'deploy-guide.md',
    'docs/api-reference.md',
    'docs/cli-skill-guide.md',
    'ai-integration/ai-assistant-setup-guide.md',
    'ai-integration/skill_workflow.md',
    'client/README.md'
  ];

  const parseTags = (content, tag) => {
    // 匹配新的注释格式 <!-- @tag --> ... <!-- /tag -->
    const regex = new RegExp(`<!-- @${tag} -->([\\s\\S]*?)<!-- /${tag} -->`, 'g');
    const matches = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      matches.push(match[1].trim());
    }
    return matches;
  };

  test.each(docFiles)('检查 %s 是否包含必需的机器可读标签', (file) => {
    const filePath = path.join(docsDir, file);
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf8');

    // 每个重构后的文档都应包含 purpose 标签，以便 AI 理解文档意图
    const purposes = parseTags(content, 'purpose');
    expect(purposes.length).toBeGreaterThan(0);

    // 对于带有输入输出或依赖的文档，进行依赖分析和代码生成的结构测试
    if (content.includes('<!-- @dependencies -->')) {
      const dependencies = parseTags(content, 'dependencies');
      expect(dependencies.length).toBeGreaterThan(0);
    }
    
    if (content.includes('<!-- @input -->')) {
      const inputs = parseTags(content, 'input');
      expect(inputs.length).toBeGreaterThan(0);
    }
  });

  test('测试交叉引用索引 (References)', () => {
    // 验证所有拥有 references 的文档是否格式正确
    docFiles.forEach(file => {
      const filePath = path.join(docsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      if (content.includes('<!-- @references -->')) {
        const references = parseTags(content, 'references');
        expect(references.length).toBeGreaterThan(0);
        // 验证里面是否包含 Markdown 链接格式
        expect(references[0]).toMatch(/\[.*\]\(.*\)/);
      }
    });
  });

  test('验证 OpenAPI yaml 是否剔除了无效的认证结构', () => {
    const openapiPath = path.join(docsDir, 'docs/openapi.yaml');
    expect(fs.existsSync(openapiPath)).toBe(true);
    const openapiContent = fs.readFileSync(openapiPath, 'utf8');
    
    // 应该在 description 里包含机器可读的 purpose
    expect(openapiContent).toContain('<!-- @purpose -->');
    // 不应该包含 jwt 或 BearerAuth 认证逻辑（因为系统已重构为 Zero-Auth）
    expect(openapiContent).not.toContain('BearerAuth');
  });
});
