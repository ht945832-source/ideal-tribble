const express = require('express');
const WebSocket = require('ws');
const app = express();

const PORT = process.env.PORT || 3000;

// Đường dẫn WebSocket kèm token do bạn bắt được (Lưu ý: Token này sẽ hết hạn theo thời gian)
const WS_URL = "wss://websocket.azhkthg1.net/wsbinary?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJ2aXBnYW1lIiwiYm90IjowLCJpc01lcmNoYW50IjpmYWxzZSwidmVyaWZpZWRCYW5rQWNjb3VudCI6ZmFsc2UsInBsYXlFdmVudExvYmJ5IjpmYWxzZSwiY3VzdG9tZXJJZCI6MzQ4NzIwNTA0LCJhZmZJZCI6IjI3OTc1NmNmMjMwODQ1ODU5ZGJkNzljODZkYzkzNDVlIiwiYmFubmVkIjpmYWxzZSwiYnJhbmQiOiJzdW4ud2luIiwiZW1haWwiOiIiLCJ0aW1lc3RhbXAiOjE3ODI2MzU3MzI2NjMsImxvY2tHYW1lcyI6W10sImFtb3VudCI6MCwibG9ja0NoYXQiOmZhbHNlLCJwaG9uZVZlcmlmaWVkIjpmYWxzZSwiaXBBZGRyZXNzIjoiMjQwMjo4MDA6NjFkNzpkNTkyOmM5YWI6NTkzOjJhYzc6OWYxYSIsIm11dGUiOmZhbHNlLCJhdmF0YXIiOiJodHRwczovL2ltYWdlcy5zd2luc2hvcC5uZXQvaW1hZ2VzL2F2YXRhci9hdmF0YXJfMDcucG5nIiwicGxhdGZvcm1JZCI6¼NCwidXNlcklkIjoiODk1MzAzYjQtODAzMy00NjM0LTg4ZTAtZTRlZDJmYzZiODZjIiwiZW1haWxWZXJpZmllZCI6bnVsbCwicmVnVGltZSI6MTc3OTcxNzA5Mzc1NywicGhvbmUiOiIiLCJkZXBvc2l0Ijp0cnVlLCJ1c2VybmFtZSI6IlNDX2hvYW5nMjI4MCJ9.5mXpOrAqXubzAv0by22L2vHqZcdMxuB5BwK2Jf5EAP0";

let ws;

function connectWebSocket() {
    ws = new WebSocket(WS_URL, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
        }
    });

    ws.on('open', () => {
        console.log("==> Đã kết nối thành công vào luồng WebSocket của game!");
    });

    ws.on('message', (data) => {
        // Kiểm tra xem dữ liệu trả về có phải dạng Nhị phân (Buffer) không
        if (Buffer.isBuffer(data)) {
            // Chuyển mảng Byte thô sang dạng chuỗi Hex để dễ quan sát cấu trúc mã hóa
            const hexString = data.toString('hex');
            console.log(`[Nhận gói tin Binary] độ dài ${data.length} bytes.`);
            console.log(`=> Chuỗi mã Hex thô: ${hexString}`);

            // Thử chuyển đổi sang dạng String thường xem có đoạn văn bản nào đọc được trực tiếp không
            const plainText = data.toString('utf-8');
            console.log(`=> Chuỗi ký tự thử nghiệm: ${plainText}`);
            
            // Ở đây bạn có thể chèn tiếp logic bóc tách vị trí byte xúc xắc hoặc phiên nếu đã tìm ra quy luật mẫu.
        } else {
            console.log("Nhận gói tin dạng văn bản thường:", data);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`Luồng kết nối bị đóng. Mã lỗi: ${code}. Lý do: ${reason.toString()}`);
        console.log("Đang tiến hành kết nối lại sau 5 giây...");
        setTimeout(connectWebSocket, 5000); // Cơ chế tự động kết nối lại khi rớt mạng
    });

    ws.on('error', (err) => {
        console.error("Lỗi kết nối luồng mạng:", err.message);
    });
}

// Khởi chạy luồng bắt gói tin ngầm
connectWebSocket();

// Giữ một cổng HTTP mở để Render không báo lỗi "Port timeout" khi deploy
app.get('/', (req, res) => {
    res.send("Bot theo dõi WebSocket đang chạy ngầm 24/7...");
});

app.listen(PORT, () => {
    console.log(`Web quản lý đang lắng nghe trên cổng ${PORT}`);
});
