const express = require('express');
const WebSocket = require('ws');
const zlib = require('zlib');
const app = express();

const PORT = process.env.PORT || 3000;
let ws = null;
let reconnectTimer = null;
let pingInterval = null;

// Biến toàn cục lưu trữ kết quả phiên mới nhất bóc tách được từ WebSocket
let latestGameResult = {
    "Phiên": null,
    "Xúc xắc1": 0,
    "Xúc xắc2": 0,
    "Xúc xắc3": 0,
    "Tổng": 0,
    "TrạngThái": "Hệ thống vừa khởi động, đang đợi gói tin từ game..."
};

const DEFAULT_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJ2aXBnYW1lIiwiYm90IjowLCJpc01lcmNoYW50IjpmYWxzZSwidmVyaWZpZWRCYW5rQWNjb3VudCI6ZmFsc2UsInBsYXlFdmVudExvYmJ5IjpmYWxzZSwiY3VzdG9tZXJJZCI6MzQ4NzIwNTA0LCJhZmZJZCI6IjI3OTc1NmNmMjMwODQ1ODU5ZGJkNzljODZkYzkzNDVlIiwiYmFubmVkIjpmYWxzZSwiYnJhbmQiOiJzdW4ud2luIiwiZW1haWwiOiIiLCJ0aW1lc3RhbXAiOjE3ODI2MzU3MzI2NjMsImxvY2tHYW1lcyI6W10sImFtb3VudCI6MCwibG9ja0NoYXQiOmZ互尔c2UsInBob25lVmVyaWZpZWQiOiZmYWxzZSwiaXBBZGRyZXNzIjoiMjQwMjo4MDA6NjFkNzpkNTkyOmM5YWI6NTkzOjJhYzc6OWYxYSIsIm11dGUiOmZhbHNlLCJhdmF0YXIiOiJodHRwczovL2ltYWdlcy5zd2luc2hvcC5uZXQvaW1hZ2VzL2F2YXRhci9hdmF0YXJfMDcucG5nIiwicGxhdGZvcm1JZCI6NCwidXNlcklkIjoiODk1MzAzYjQtODAzMy00NjM0LTg4ZTAtZTRlZDJmYzZiODZjIiwiZW1haWxWZXJpZmllZCI6bnVsbCwicmVnVGltZSI6MTc3OTcxNzA5Mzc1NywicGhvbmUiOiIiLCJkZXBvc2l0Ijp0cnVlLCJ1c2VybmFtZSI6IlNDX2hvYW5nMjI4MCJ9.5mXpOrAqXubzAv0by22L2vHqZcdMxuB5BwK2Jf5EAP0";
let activeToken = DEFAULT_TOKEN;

// Hàm phân tích logic dòng byte thực tế (Không sử dụng Math.random)
function analyzeGameBinary(buffer) {
    try {
        const hexStr = buffer.toString('hex');
        const utf8Str = buffer.toString('utf-8');

        let session = null;
        let d1 = 0, d2 = 0, d3 = 0, total = 0;
        let isFound = false;

        // Quét tìm số phiên cược (Chuỗi 6-7 số liên tiếp)
        const sessionMatch = utf8Str.match(/\d{6,7}/);
        if (sessionMatch) {
            session = parseInt(sessionMatch[0]);
        }

        // Quét tìm cụm 3 xúc xắc kề nhau trong chuỗi byte
        const dicePattern = hexStr.match(/([0-1][1-6])([0-1][1-6])([0-1][1-6])/); 
        if (dicePattern) {
            d1 = parseInt(dicePattern[1], 16);
            d2 = parseInt(dicePattern[2], 16);
            d3 = parseInt(dicePattern[3], 16);
            total = d1 + d2 + d3;
            isFound = true;
        } else {
            // Dự phòng: Tìm định dạng chuỗi "X-Y-Z"
            const numbers = utf8Str.match(/[1-6]\s*-\s*[1-6]\s*-\s*[1-6]/);
            if (numbers) {
                const parts = numbers[0].split('-').map(n => parseInt(n.trim()));
                d1 = parts[0];
                d2 = parts[1];
                d3 = parts[2];
                total = d1 + d2 + d3;
                isFound = true;
            }
        }

        // Cập nhật vào biến bộ nhớ chính nếu bóc tách thành công thông tin thực tế
        if (session || isFound) {
            latestGameResult = {
                "Phiên": session || latestGameResult["Phiên"],
                "Xúc xắc1": d1 || latestGameResult["Xúc xắc1"],
                "Xúc xắc2": d2 || latestGameResult["Xúc xắc2"],
                "Xúc xắc3": d3 || latestGameResult["Xúc xắc3"],
                "Tổng": total || latestGameResult["Tổng"],
                "TrạngThái": "Dữ liệu cập nhật liên tục từ luồng mạng!"
            };
        }
    } catch (e) {
        console.error("Lỗi parse gói tin nhị phân:", e.message);
    }
}

function connectWebSocket(token) {
    if (ws) {
        ws.removeAllListeners();
        try { ws.close(); } catch (e) {}
    }
    clearTimeout(reconnectTimer);
    clearInterval(pingInterval);

    activeToken = token;
    const wsUrl = `wss://websocket.azhkthg1.net/wsbinary?token=${token}`;
    
    ws = new WebSocket(wsUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            'Origin': 'https://sun.win',
            'Host': 'websocket.azhkthg1.net'
        }
    });

    ws.on('open', () => {
        console.log("==> Đã bẻ khóa thành công luồng WebSocket!");
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.ping();
        }, 15000);
    });

    ws.on('message', (data) => {
        if (Buffer.isBuffer(data)) {
            zlib.gunzip(data, (err, uncompressed) => {
                if (!err) analyzeGameBinary(uncompressed);
                else analyzeGameBinary(data);
            });
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`Luồng kết nối bị đóng (Mã: ${code})`);
        clearInterval(pingInterval);
        if (code !== 400 && code !== 1002) {
            reconnectTimer = setTimeout(() => connectWebSocket(activeToken), 5000);
        }
    });

    ws.on('error', (err) => { console.error("Lỗi luồng mạng:", err.message); });
}

connectWebSocket(activeToken);

// ==========================================================
// ĐƯỜNG LINK API ĐỂ NGƯỜI ANH EM LẤY KẾT QUẢ ĐƯA VÀO TOOL
// ==========================================================
app.get('/api/get-latest', (req, res) => {
    // Trả về đúng định dạng chuẩn thô người anh em mong muốn
    return res.json({
        "Phiên": latestGameResult["Phiên"],
        "Xúc xắc1": latestGameResult["Xúc xắc1"],
        "Xúc xắc2": latestGameResult["Xúc xắc2"],
        "Xúc xắc3": latestGameResult["Xúc xắc3"],
        "Tổng": latestGameResult["Tổng"]
    });
});

// Cập nhật token động
app.get('/api/update-token', (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false });
    connectWebSocket(token);
    return res.json({ success: true, message: "Đang nạp token mới!" });
});

app.get('/', (req, res) => {
    res.send("Bot đang chạy ngầm. Gọi đường dẫn /api/get-latest để lấy data kết quả.");
});

app.listen(PORT, () => {
    console.log(`Hệ thống đang hoạt động trên cổng: ${PORT}`);
});
