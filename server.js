const express = require('express');
const WebSocket = require('ws');
const zlib = require('zlib');
const app = express();

const PORT = process.env.PORT || 3000;
let ws = null;
let reconnectTimer = null;
let pingInterval = null;

// Token mặc định ban đầu của người anh em
const DEFAULT_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJ2aXBnYW1lIiwiYm90IjowLCJpc01lcmNoYW50IjpmYWxzZSwidmVyaWZpZWRCYW5rQWNjb3VudCI6ZmFsc2UsInBsYXlFdmVudExvYmJ5IjpmYWxzZSwiY3VzdG9tZXJJZCI6MzQ4NzIwNTA0LCJhZmZJZCI6IjI3OTc1NmNmMjMwODQ1ODU5ZGJkNzljODZkYzkzNDVlIiwiYmFubmVkIjpmYWxzZSwiYnJhbmQiOiJzdW4ud2luIiwiZW1haWwiOiIiLCJ0aW1lc3RhbXAiOjE3ODI2MzU3MzI2NjMsImxvY2tHYW1lcyI6W10sImFtb3VudCI6MCwibG9ja0NoYXQiOmZhbHNlLCJwaG9uZVZlcmlmaWVkIjpmYWxzZSwiaXBBZGRyZXNzIjoiMjQwMjo4MDA6NjFkNzpkNTkyOmM5YWI6NTkzOjJhYzc6OWYxYSIsIm11dGUiOmZhbHNlLCJhdmF0YXIiOiJodHRwczovL2ltYWdlcy5zd2luc2hvcC5uZXQvaW1hZ2VzL2F2YXRhci9hdmF0YXJfMDcucG5nIiwicGxhdGZvcm1JZCI6NCwidXNlcklkIjoiODk1MzAzYjQtODAzMy00NjM0LTg4ZTAtZTRlZDJmYzZiODZjIiwiZW1haWxWZXJpZmllZCI6bnVsbCwicmVnVGltZSI6MTc3OTcxNzA5Mzc1NywicGhvbmUiOiIiLCJkZXBvc2l0Ijp0cnVlLCJ1c2VybmFtZSI6IlNDX2hvYW5nMjI4MCJ9.5mXpOrAqXubzAv0by22L2vHqZcdMxuB5BwK2Jf5EAP0";
let activeToken = DEFAULT_TOKEN;

// Hàm phân tích logic mảng byte thực tế để trích xuất điểm số xúc xắc (Không ngẫu nhiên)
function analyzeGameBinary(buffer) {
    try {
        const hexStr = buffer.toString('hex');
        const utf8Str = buffer.toString('utf-8');

        // Khởi tạo cấu trúc dữ liệu chuẩn theo form của người anh em
        let gameResult = {
            "Phiên": null,
            "Xúc xắc1": 0,
            "Xúc xắc2": 0,
            "Xúc xắc3": 0,
            "Tổng": 0,
            "TrạngThái": "Đang phân tích dòng byte..."
        };

        // Kỹ thuật quét mẫu byte (Pattern Matching): Tìm chuỗi chứa thông tin xúc xắc số từ 1-6
        // Trong cổng game nhị phân, kết quả thường đi liền nhau dưới dạng mảng byte hoặc chuỗi ngăn cách bởi dấu gạch ngang/ký tự đặc biệt
        const dicePattern = hexStr.match(/([0-1][1-6])([0-1][1-6])([0-1][1-6])/); 
        
        // Thử tìm số phiên cược (Thường là chuỗi số có độ dài từ 6 đến 7 chữ số liên tiếp trong chuỗi UTF-8 công khai)
        const sessionMatch = utf8Str.match(/\d{6,7}/);
        if (sessionMatch) {
            gameResult["Phiên"] = parseInt(sessionMatch[0]);
        }

        // Nếu tìm thấy dấu vết mảng 3 xúc xắc liền kề trong dòng byte thô
        if (dicePattern) {
            gameResult["Xúc xắc1"] = parseInt(dicePattern[1], 16);
            gameResult["Xúc xắc2"] = parseInt(dicePattern[2], 16);
            gameResult["Xúc xắc3"] = parseInt(dicePattern[3], 16);
            gameResult["Tổng"] = gameResult["Xúc xắc1"] + gameResult["Xúc xắc2"] + gameResult["Xúc xắc3"];
            gameResult["TrạngThái"] = "Bóc tách thành công từ Byte mã thô!";
        } else {
            // Giải pháp dự phòng 2: Tìm kiếm văn bản thuần trực tiếp nếu gói tin được decode một phần
            const numbers = utf8Str.match(/[1-6]\s*-\s*[1-6]\s*-\s*[1-6]/); // Ví dụ dạng "3 - 4 - 5" hoặc "1-2-6"
            if (numbers) {
                const parts = numbers[0].split('-').map(n => parseInt(n.trim()));
                gameResult["Xúc xắc1"] = parts[0];
                gameResult["Xúc xắc2"] = parts[1];
                gameResult["Xúc xắc3"] = parts[2];
                gameResult["Tổng"] = parts[0] + parts[1] + parts[2];
                gameResult["TrạngThái"] = "Bóc tách thành công từ chuỗi văn bản!";
            }
        }

        // Chỉ in Log ra Render khi đã bóc tách được dữ liệu phiên hoặc xúc xắc thực tế
        if (gameResult["Phiên"] || gameResult["Tổng"] > 0) {
            console.log("\n================ KẾT QUẢ PHÂN TÍCH LOGIC TỪ GAME ================");
            console.log(`Phiên: ${gameResult["Phiên"] || 'Đang cập nhật...'}`);
            console.log(`Xúc xắc1: ${gameResult["Xúc xắc1"]}`);
            console.log(`Xúc xắc2: ${gameResult["Xúc xắc2"]}`);
            console.log(`Xúc xắc3: ${gameResult["Xúc xắc3"]}`);
            console.log(`Tổng điểm: ${gameResult["Tổng"]} => ${gameResult["Tổng"] >= 11 ? "TÀI" : "XỈU"}`);
            console.log(`Phương thức: ${gameResult["TrạngThái"]}`);
            console.log("=================================================================\n");
        }
        
        return gameResult;
    } catch (e) {
        console.error("Lỗi phân tích cú pháp gói tin nhị phân:", e.message);
        return null;
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
    
    console.log("==> Tiến hành kết nối luồng bắt gói tin WebSocket Sunwin...");

    // Cấu hình đầy đủ các tham số bảo mật thiết bị giống iOS để chống lỗi 400 Bad Request
    ws = new WebSocket(wsUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            'Origin': 'https://sun.win',
            'Host': 'websocket.azhkthg1.net',
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    });

    ws.on('open', () => {
        console.log("==> [KẾT NỐI THÀNH CÔNG] Bot đã bẻ khóa thành công luồng mạng trên Render!");
        
        // Cơ chế giữ nhịp kết nối (Heartbeat): Gửi gói tin Ping trống mỗi 15 giây để không bị Render hoặc Cổng Game tự động ngắt kết nối (Mã lỗi 1006)
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
            }
        }, 15000);
    });

    ws.on('message', (data) => {
        if (Buffer.isBuffer(data)) {
            // Thử nghiệm giải nén bằng zlib phòng trường hợp gói tin nhị phân bị nén bằng Gzip/Deflate nâng cao
            zlib.gunzip(data, (err, uncompressed) => {
                if (!err) {
                    analyzeGameBinary(uncompressed);
                } else {
                    // Dữ liệu thô không nén -> Phân tích logic trực tiếp từ mảng byte nhận được
                    analyzeGameBinary(data);
                }
            });
        }
    });

    ws.on('close', (code, reason) => {
        const msg = reason ? reason.toString() : 'Không rõ nguyên nhân';
        console.log(`Luồng kết nối bị đóng bởi máy chủ. Mã lỗi: ${code} | Lý do: ${msg}`);
        clearInterval(pingInterval);

        // Nếu mã lỗi 400 hoặc 1002 nghĩa là Token đã hết hạn hoàn toàn, không kết nối lại để tránh spam lỗi log
        if (code === 400 || code === 1002) {
            console.log("==> ALERT: Token này đã hết hạn hoặc bị khóa IP. Người anh em vui lòng cập nhật Token mới qua đường dẫn API.");
        } else {
            // Nếu do lỗi mạng gián đoạn, tự động kết nối lại sau 5 giây để duy trì hệ thống chạy ngầm
            console.log("Đang tiến hành kết nối lại luồng hệ thống...");
            reconnectTimer = setTimeout(() => connectWebSocket(activeToken), 5000);
        }
    });

    ws.on('error', (err) => {
        console.error("Lỗi phát sinh trên luồng kết nối:", err.message);
    });
}

// Tự động kích hoạt luồng theo dõi ngay khi khởi động Render
connectWebSocket(activeToken);

// API điều khiển từ xa để cập nhật token động mà không cần Re-deploy ứng dụng trên Render
app.get('/api/update-token', (req, res) => {
    const { token } = req.query;
    if (!token) {
        return res.status(400).json({ success: false, message: "Thiếu tham số token rồi người ae ơi!" });
    }
    
    console.log("==> Nhận lệnh thay đổi Token hệ thống từ API. Tiến hành làm mới luồng...");
    connectWebSocket(token);
    return res.json({ success: true, message: "Đang nạp token mới và thực hiện bẻ khóa lại luồng mạng!" });
});

app.get('/', (req, res) => {
    res.send(`Bot Phân Tích WebSocket Sunwin đang chạy ngầm 24/7. Token hiện tại: ${activeToken.substring(0, 20)}...`);
});

app.listen(PORT, () => {
    console.log(`Hệ thống back-end đang hoạt động ổn định trên cổng: ${PORT}`);
});
