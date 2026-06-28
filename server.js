const express = require('express');
const WebSocket = require('ws');
const zlib = require('zlib');
const app = express();

const PORT = process.env.PORT || 3000;
let ws = null;
let reconnectTimer = null;

// Token mặc định do người ae cung cấp
const DEFAULT_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJ2aXBnYW1lIiwiYm90IjowLCJpc01lcmNoYW50IjpmYWxzZSwidmVyaWZpZWRCYW5rQWNjb3VudCI6ZmFsc2UsInBsYXlFdmVudExvYmJ5IjpmYWxzZSwiY3VzdG9tZXJJZCI6MzQ4NzIwNTA0LCJhZmZJZCI6IjI3OTc1NmNmMjMwODQ1ODU5ZGJkNzljODZkYzkzNDVlIiwiYmFubmVkIjpmYWxzZSwiYnJhbmQiOiJzdW4ud2luIiwiZW1haWwiOiIiLCJ0aW1lc3RhbXAiOjE3ODI2MzU3MzI2NjMsImxvY2tHYW1lcyI6W10sImFtb3VudCI6MCwibG9ja0NoYXQiOmZhbHNlLCJwaG9uZVZlcmlmaWVkIjpmYWxzZSwiaXBBZGRyZXNzIjoiMjQwMjo4MDA6NjFkNzpkNTkyOmM5YWI6NTkzOjJhYzc6OWYxYSIsIm11dGUiOmZhbHNlLCJhdmF0YXIiOiJodHRwczovL2ltYWdlcy5zd2luc2hvcC5uZXQvaW1hZ2VzL2F2YXRhci9hdmF0YXJfMDcucG5nIiwicGxhdGZvcm1JZCI6NCwidXNlcklkIjoiODk1MzAzYjQtODAzMy00NjM0LTg4ZTAtZTRlZDJmYzZiODZjIiwiZW1haWxWZXJpZmllZCI6bnVsbCwicmVnVGltZSI6MTc3OTcxNzA5Mzc1NywicGhvbmUiOiIiLCJkZXBvc2l0Ijp0cnVlLCJ1c2VybmFtZSI6IlNDX2hvYW5nMjI4MCJ9.5mXpOrAqXubzAv0by22L2vHqZcdMxuB5BwK2Jf5EAP0";
let activeToken = DEFAULT_TOKEN;

function connectWebSocket(token) {
    if (ws) {
        ws.removeAllListeners();
        try { ws.close(); } catch (e) {}
    }
    clearTimeout(reconnectTimer);

    activeToken = token;
    const wsUrl = `wss://websocket.azhkthg1.net/wsbinary?token=${token}`;
    
    console.log("==> Đang khởi tạo luồng kết nối an toàn...");

    // Cấu hình Header nâng cao giả lập 100% thiết bị thật để tránh lỗi 400 Bad Request
    ws = new WebSocket(wsUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            'Origin': 'https://sun.win',
            'Host': 'websocket.azhkthg1.net',
            'Accept-Language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    });

    ws.on('open', () => {
        console.log("==> [KẾT NỐI THÀNH CÔNG] Bot đã bẻ khóa thành công luồng mạng trên Render!");
    });

    ws.on('message', (data) => {
        if (Buffer.isBuffer(data)) {
            console.log(`\n[Gói tin mới] Nhận được ${data.length} bytes dữ liệu nhị phân.`);
            console.log(`-> Hex thô: ${data.toString('hex')}`);

            // Thử giải nén bằng zlib đề phòng dữ liệu bị nén định dạng Gzip/Deflate
            zlib.gunzip(data, (err, uncompressed) => {
                if (!err) {
                    console.log(`-> Kết quả giải nén (Text): ${uncompressed.toString('utf-8')}`);
                } else {
                    // Nếu không phải dạng nén, in trực tiếp dạng UTF-8 thô
                    const plainText = data.toString('utf-8');
                    // Lọc bỏ các ký tự điều khiển lạ để hiển thị văn bản sạch
                    const cleanText = plainText.replace(/[\x00-\x1F\x7F-\x9F]/g, " ");
                    console.log(`-> Văn bản giải mã thô: ${cleanText.trim()}`);
                }
            });
        } else {
            console.log("-> Nhận gói tin văn bản thường:", data);
        }
    });

    ws.on('close', (code, reason) => {
        const msg = reason ? reason.toString() : 'Không rõ lý do';
        console.log(`Luồng kết nối bị đóng bởi máy chủ. Mã lỗi: ${code} | Lý do: ${msg}`);
        
        // Nếu token bị chết hoàn toàn (Server trả về lỗi bắt tay hoặc xác thực sai)
        if (code === 400 || code === 1002) {
            console.log("==> ALERT: Token này đã hết hạn hoặc bị khóa IP. Vui lòng nạp Token mới qua đường dẫn API.");
        } else {
            // Lỗi mạng thông thường, tự động kết nối lại sau 5 giây
            console.log("Đang tiến hành kết nối lại hệ thống...");
            reconnectTimer = setTimeout(() => connectWebSocket(activeToken), 5000);
        }
    });

    ws.on('error', (err) => {
        console.error("Lỗi phát sinh trên luồng kết nối:", err.message);
    });
}

// Tự động kích hoạt luồng chạy ngầm ngay khi khởi động
connectWebSocket(activeToken);

// Kênh API để cập nhật token động từ xa mà không cần restart lại ứng dụng trên Render
app.get('/api/update-token', (req, res) => {
    const { token } = req.query;
    if (!token) {
        return res.status(400).json({ success: false, message: "Thiếu tham số token người ae ơi!" });
    }
    
    console.log("==> Nhận lệnh thay đổi Token từ API. Tiến hành làm mới luồng kết nối...");
    connectWebSocket(token);
    return res.json({ success: true, message: "Đang nạp token mới và thực hiện kết nối lại!" });
});

app.get('/', (req, res) => {
    res.send(`Bot WebSocket đang chạy 24/7. Token hiện tại: ${activeToken.substring(0, 15)}...`);
});

app.listen(PORT, () => {
    console.log(`Hệ thống back-end đang hoạt động ổn định trên cổng: ${PORT}`);
});
