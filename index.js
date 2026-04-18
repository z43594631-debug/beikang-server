const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors()); // 允许前端访问
app.use(express.json({ limit: '10mb' })); // 解析前端发的 JSON，增加限制以支持头像上传
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const USERS_FILE = path.join(__dirname, 'users.json');
const CHECKIN_FILE = path.join(__dirname, 'checkin_history.json');
const ATTENDANCE_FILE = path.join(__dirname, 'attendance.json');
const ACTIVE_CHALLENGES_FILE = path.join(__dirname, 'active_challenges.json');

// 初始化文件
[USERS_FILE, CHECKIN_FILE, ATTENDANCE_FILE, ACTIVE_CHALLENGES_FILE].forEach(file => {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify((file === ACTIVE_CHALLENGES_FILE || file === ATTENDANCE_FILE) ? {} : []));
  }
});

// 注册接口
app.post('/api/register', (req, res) => {
  try {
    const { phone, password, email } = req.body;
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    if (users.find(u => u.phone === phone)) {
      return res.status(400).json({ error: '该手机号已注册' });
    }
    const newUser = { 
      phone, 
      password, 
      email, 
      name: `用户${phone.slice(-4)}`,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${phone}`,
      daysSinceSurgery: 0,
      energyPoints: 0,
      growthLevel: 0,
      createdAt: new Date().toISOString() 
    };
    users.push(newUser);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    
    // 为新用户初始化数据结构
    const attendance = JSON.parse(fs.readFileSync(ATTENDANCE_FILE, 'utf-8'));
    const activeChallenges = JSON.parse(fs.readFileSync(ACTIVE_CHALLENGES_FILE, 'utf-8'));
    if (!attendance[phone]) attendance[phone] = [];
    if (!activeChallenges[phone]) activeChallenges[phone] = {};
    fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(attendance, null, 2));
    fs.writeFileSync(ACTIVE_CHALLENGES_FILE, JSON.stringify(activeChallenges, null, 2));

    res.json({ success: true, message: '注册成功' });
  } catch (error) {
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 登录接口
app.post('/api/login', (req, res) => {
  try {
    const { identifier, password } = req.body;
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    
    const user = users.find(u => (u.phone === identifier || u.email === identifier) && u.password === password);
    
    if (!user) {
      return res.status(401).json({ error: '账号或密码错误' });
    }

    // 登录时确保用户的数据结构存在
    const attendance = JSON.parse(fs.readFileSync(ATTENDANCE_FILE, 'utf-8'));
    const activeChallenges = JSON.parse(fs.readFileSync(ACTIVE_CHALLENGES_FILE, 'utf-8'));
    let updated = false;
    if (!attendance[user.phone]) { attendance[user.phone] = []; updated = true; }
    if (!activeChallenges[user.phone]) { activeChallenges[user.phone] = {}; updated = true; }
    if (updated) {
      fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(attendance, null, 2));
      fs.writeFileSync(ACTIVE_CHALLENGES_FILE, JSON.stringify(activeChallenges, null, 2));
    }
    
    // 登录成功，返回用户信息
    res.json({ success: true, user: { 
      phone: user.phone, 
      email: user.email, 
      name: user.name || `用户${user.phone.slice(-4)}`, 
      avatar: user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.phone}`,
      age: user.age,
      gender: user.gender,
      daysSinceSurgery: user.daysSinceSurgery || 0,
      energyPoints: user.energyPoints || 0,
      growthLevel: user.growthLevel || 0,
      createdAt: user.createdAt
    } });
  } catch (error) {
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 添加打卡历史记录
app.post('/api/checkin-history', (req, res) => {
  try {
    const { phone, taskTitle, checkInTime, moodValue, note } = req.body;
    if (!phone) return res.status(400).json({ error: '缺少用户标识' });

    const history = JSON.parse(fs.readFileSync(CHECKIN_FILE, 'utf-8'));
    const newRecord = { 
      id: Date.now().toString(), 
      phone,
      taskTitle, 
      checkInTime: checkInTime || new Date().toLocaleString(), 
      moodValue,
      note,
      createdAt: new Date().toISOString() 
    };
    history.push(newRecord);
    fs.writeFileSync(CHECKIN_FILE, JSON.stringify(history, null, 2));
    res.json({ success: true, data: newRecord });
  } catch (error) {
    res.status(500).json({ error: '保存打卡记录失败' });
  }
});

// 获取特定用户的打卡历史记录
app.get('/api/checkin-history', (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: '缺少用户标识' });

    const history = JSON.parse(fs.readFileSync(CHECKIN_FILE, 'utf-8'));
    const userHistory = history.filter(h => h.phone === phone);
    res.json(userHistory.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  } catch (error) {
    res.status(500).json({ error: '获取打卡记录失败' });
  }
});

// 添加每日成功打卡日期
app.post('/api/attendance', (req, res) => {
  try {
    const { phone, date } = req.body; // YYYY-MM-DD
    if (!phone) return res.status(400).json({ error: '缺少用户标识' });

    const attendance = JSON.parse(fs.readFileSync(ATTENDANCE_FILE, 'utf-8'));
    if (!attendance[phone]) attendance[phone] = [];
    
    if (!attendance[phone].includes(date)) {
      attendance[phone].push(date);
      fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(attendance, null, 2));
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '保存每日打卡失败' });
  }
});

// 获取特定用户的每日打卡日期
app.get('/api/attendance', (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: '缺少用户标识' });

    const attendance = JSON.parse(fs.readFileSync(ATTENDANCE_FILE, 'utf-8'));
    res.json(attendance[phone] || []);
  } catch (error) {
    res.status(500).json({ error: '获取每日打卡记录失败' });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    const response = await axios.post('https://aliyuncs.com', {
      model: "qwen-plus",
      messages: [{ role: "user", content: prompt }]
    }, {
      headers: { 'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`, 'Content-Type': 'application/json' }
    });
    res.json({ result: response.data.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: 'AI 服务暂时不可用' });
  }
});

// 获取标准北京时间 (UTC+8)
app.get('/api/time', (req, res) => {
  try {
    const now = new Date();
    // 获取 UTC 时间并调整 8 小时
    const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    
    res.json({
      iso: now.toISOString(),
      timestamp: now.getTime(),
      year: beijingTime.getUTCFullYear(),
      month: beijingTime.getUTCMonth() + 1,
      day: beijingTime.getUTCDate(),
      formatted: `${beijingTime.getUTCFullYear()}-${(beijingTime.getUTCMonth() + 1).toString().padStart(2, '0')}-${beijingTime.getUTCDate().toString().padStart(2, '0')}`
    });
  } catch (error) {
    res.status(500).json({ error: '获取服务器时间失败' });
  }
});

// 提醒相关的 API 接口
app.post('/api/reminder-permission', (req, res) => {
  try {
    const { phone, challengeId, action } = req.body;
    // 这里模拟检查权限，默认返回允许
    res.json({ success: true, allowed: true, message: '权限检查通过' });
  } catch (error) {
    res.status(500).json({ error: '权限检查失败' });
  }
});

app.post('/api/add-reminder', (req, res) => {
  try {
    const { phone, challengeId, title } = req.body;
    // 这里模拟添加提醒，实际场景可能需要调用系统 API
    console.log(`添加提醒: ${title} (User: ${phone}, Challenge: ${challengeId})`);
    res.json({ success: true, message: '提醒已成功添加到系统日历' });
  } catch (error) {
    res.status(500).json({ error: '添加提醒失败' });
  }
});

// 获取特定用户的活跃挑战
app.get('/api/active-challenges', (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: '缺少用户标识' });

    const data = JSON.parse(fs.readFileSync(ACTIVE_CHALLENGES_FILE, 'utf-8'));
    res.json(data[phone] || {});
  } catch (error) {
    res.status(500).json({ error: '获取活跃挑战失败' });
  }
});

app.post('/api/start-challenge', (req, res) => {
  try {
    const { phone, challengeId, startDate } = req.body;
    if (!phone) return res.status(400).json({ error: '缺少用户标识' });

    const data = JSON.parse(fs.readFileSync(ACTIVE_CHALLENGES_FILE, 'utf-8'));
    if (!data[phone]) data[phone] = {};
    
    data[phone][challengeId] = startDate;
    fs.writeFileSync(ACTIVE_CHALLENGES_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true, startDate });
  } catch (error) {
    res.status(500).json({ error: '开启挑战失败' });
  }
});

// 症状预测接口 (转发给 Python 后端或提供回退逻辑)
app.post('/api/predict', async (req, res) => {
  try {
    const { features } = req.body;
    
    // 尝试调用 Python 后端 (支持通过环境变量配置地址)
    const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL ;
    try {
      const response = await axios.post(`${PYTHON_BACKEND_URL}/predict`, { features }, { timeout: 3000 });
      return res.json(response.data);
    } catch (err) {
      console.warn('[Predict] Python backend not available, using fallback logic');
      // 回退逻辑：根据特征简单判断 (演示用)
      // 在实际生产中，应确保 Python 后端始终可用
      const sum = features.reduce((a, b) => a + b, 0);
      const result = sum > 15 ? [0] : [1]; // 0: 高风险, 1: 低风险 (模拟逻辑)
      
      res.json({
        success: true,
        result: result,
        isFallback: true
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: '预测服务暂不可用' });
  }
});

// 更新用户资料
app.post('/api/user/profile', (req, res) => {
  try {
    const updatedUser = req.body;
    const { phone } = updatedUser;
    
    console.log(`[Profile Update Request] User: ${phone}, Body Size: ${JSON.stringify(req.body).length} bytes`);

    if (!phone) {
      console.warn('[Profile Update] Missing phone identifier');
      return res.status(400).json({ error: '缺少用户标识' });
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    const userIndex = users.findIndex(u => u.phone === phone);
    
    if (userIndex === -1) {
      console.warn(`[Profile Update] User not found: ${phone}`);
      return res.status(404).json({ error: '用户不存在' });
    }

    // 更新用户信息，保留 createdAt 和 password (除非 body 中有 password，但一般建议分开处理)
    users[userIndex] = {
      ...users[userIndex],
      ...updatedUser
    };
    
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    console.log(`[Profile Update] Successfully updated user: ${phone}`);
    res.json({ success: true, message: '个人资料已更新' });
  } catch (error) {
    console.error('[Profile Update Error]:', error);
    res.status(500).json({ error: `更新个人资料失败: ${error.message}` });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
