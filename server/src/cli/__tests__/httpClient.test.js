const axios = require('axios');
const httpClient = require('../httpClient');

jest.mock('axios');

describe('CLI HTTP client authentication', () => {
  const originalToken = process.env.AGENTTODO_API_TOKEN;

  afterEach(() => {
    jest.clearAllMocks();
    if (originalToken === undefined) delete process.env.AGENTTODO_API_TOKEN;
    else process.env.AGENTTODO_API_TOKEN = originalToken;
  });

  test('adds a timeout when no token is configured', async () => {
    delete process.env.AGENTTODO_API_TOKEN;
    axios.post.mockResolvedValue({ data: {} });

    await httpClient.post('http://localhost/api/tasks', { title: 'test' });
    expect(axios.post).toHaveBeenCalledWith('http://localhost/api/tasks', { title: 'test' }, {
      timeout: 10000,
    });
  });

  test('adds a bearer token when configured', async () => {
    process.env.AGENTTODO_API_TOKEN = 'secret';
    axios.get.mockResolvedValue({ data: {} });

    await httpClient.get('http://localhost/api/tasks');
    expect(axios.get).toHaveBeenCalledWith('http://localhost/api/tasks', {
      headers: { Authorization: 'Bearer secret' },
      timeout: 10000,
    });
  });
});
