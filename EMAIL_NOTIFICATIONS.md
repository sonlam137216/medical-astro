# Email thông báo tư vấn

Triển khai ngày 28/10/2026 theo `EMAIL_NOTIFICATIONS_PLAN.md`. Nhà cung cấp: Resend; backend: Cloudflare Workers; hàng đợi: D1. Mặc định **tắt**, chỉ bật trong CMS sau khi xác minh người nhận và gửi thử thành công. Chủ dự án báo đã thêm secret `RESEND_API_KEY` trên Worker. Chưa gửi email thật hoặc deploy remote trong đợt implement này.

## Cấu hình mỗi môi trường

Trong `wrangler.jsonc`, đặt riêng cho production và `env.staging.vars`:

| Biến runtime         | Giá trị                                                                                                                                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMAIL_FROM`         | `Melatec <no-reply@melatecdentalclinic.com>` (địa chỉ chủ dự án cung cấp; tên hiển thị dùng tên thương hiệu)                                                                                                                                                          |
| `EMAIL_ADMIN_ORIGIN` | Origin HTTPS thực tế nơi đăng nhập admin, không có path/query; ví dụ `https://your-worker.workers.dev`. Có thể khác domain gửi. Production đã đặt `https://melatecdentalclinic.com` theo URL admin chủ dự án cung cấp; staging vẫn để trống chờ URL thử nghiệm riêng. |
| `EMAIL_ENVIRONMENT`  | `production` hoặc `staging`; bắt buộc khai báo rõ                                                                                                                                                                                                                     |
| `EMAIL_STAGING_TO`   | Hộp thư thử nghiệm duy nhất được staging phép gửi; bắt buộc trên staging, dùng chữ thường                                                                                                                                                                             |
| `EMAIL_HOURLY_LIMIT` | Ngân sách API attempts trong 60 phút trượt: production 20, staging 10                                                                                                                                                                                                 |
| `EMAIL_DAILY_LIMIT`  | Ngân sách API attempts trong 24 giờ trượt: production 90, staging 30                                                                                                                                                                                                  |

Đặt secret bằng terminal (nhập key tại prompt, không đưa vào dòng lệnh/chat/Git):

```sh
npx wrangler secret put RESEND_API_KEY --env staging
npx wrangler secret put RESEND_API_KEY
```

Dùng key riêng cho staging/production, quyền Sending access giới hạn domain gửi. Local dùng `.dev.vars` đã được Git ignore; xem `.dev.vars.example`. Key local hiện chưa được cấu hình. Code không hỗ trợ chế độ `onboarding@resend.dev`.

Trong Resend, tắt **Open tracking** và **Click tracking** cho domain gửi trước khi thử. Email dùng plain text, không chứa họ tên, điện thoại, email khách hoặc dịch vụ. Không gửi email cho khách. Kiểm tra hạn mức gói thực tế trên tài khoản, gồm cả lưu lượng ngoài website; ngân sách D1 chỉ đếm API attempts do website này gửi. Không tự động nâng gói. Thời gian lưu dữ liệu và log của nhà cung cấp cần được chủ tài khoản rà soát.

Cấu hình đầy đủ Turnstile theo `.dev.vars.example`: runtime `TURNSTILE_SECRET_KEY`, build `TURNSTILE_SITE_KEY` và hostname hợp lệ. Hiện cả hai chưa có trong cấu hình local. Email không thay đổi quy tắc chấp nhận form hiện có; giới hạn email toàn hệ thống vẫn hoạt động khi Turnstile chưa bật.

## Rollout

Push lên `main` chỉ kích hoạt CI theo workflow trong repo. Deploy qua Publish hoặc lệnh deploy riêng; migration không tự chạy.

1. Kiểm tra đúng D1 theo môi trường. Production trong repo hiện vẫn có database ID placeholder; thay bằng ID thật trước khi deploy. Không áp migration bằng ID phỏng đoán.
2. Áp migration trước deploy: `npm run db:migrate:staging`, sau đó `npm run db:migrate:production` khi chuyển production. Migration mới `0027_email_notifications.sql` không bật email, không backfill yêu cầu cũ.
3. Cấu hình vars/secrets ở trên. `EMAIL_ADMIN_ORIGIN` là biến **runtime riêng**, không thay thế `SITE_URL` lúc build. Publish workflow hiện có giữ nguyên; vars đi theo Wrangler, secret được giữ trên Worker.
4. Build/deploy theo quy trình `PUBLISHING.md`. Entrypoint mới `src/worker.ts` chuyển HTTP sang Astro `handle` và nhận `scheduled`; cron mỗi phút được khai báo riêng cho cả hai môi trường, không tạo Worker thứ hai.
5. Trong `/admin` → **Email notifications**, nhập email nhận → **Send verification link**. Staging chỉ cho phép `EMAIL_STAGING_TO`. Chờ tối thiểu 60 giây nếu cần gửi lại.
6. Đăng nhập admin, mở lại link trong email, bấm **Confirm recipient**. GET chỉ hiển thị trang xác nhận; POST mới đổi địa chỉ. Link hết hạn sau một giờ, chỉ dùng một lần; DB chỉ lưu SHA-256 của token. Link dùng fragment (`#token=…`) để token không đi vào URL HTTP/access log; trình duyệt xóa fragment khỏi lịch sử và đưa token vào POST body. Cần JavaScript cho bước xác nhận. Nếu link mở khi chưa đăng nhập, đăng nhập rồi mở lại link từ email.
7. **Queue test email**, chờ khoảng một phút và refresh. Trạng thái `accepted` + mã Resend chỉ xác nhận nhà cung cấp nhận lệnh gửi. Kiểm tra hộp thư thật/spam trước khi bấm **Enable notifications**.
8. Gửi form tư vấn thử trên staging: kiểm tra có đúng một row tư vấn, một outbox và một email; gửi lại cùng submission ID không sinh thêm email. Kiểm tra đăng nhập, CSRF, Turnstile và một lần tắt/bật. Sau khi staging đạt yêu cầu, lặp cấu hình/xác minh/thử trên production.

## Vận hành

- Cài đặt được lưu ngay, không cần Publish. Xem trạng thái xác minh và 25 email mới nhất tại `/admin/email`.
- Đổi địa chỉ: địa chỉ cũ vẫn hoạt động khi chờ xác minh. Xác minh thành công chuyển sang địa chỉ mới; nên gửi thử lại. Nếu đang tắt thì lần bật tiếp theo đòi test cho địa chỉ mới.
- **Pause notifications** ngừng lấy việc tư vấn mới để gửi; email đang gọi API có thể vẫn đến. Pending alerts được giữ đến 20 giờ; bật lại chỉ tiếp tục việc còn hạn, không tạo email cho toàn bộ lịch sử. Test thủ công vẫn gửi khi paused.
- Công việc chưa thử dùng người nhận đang hoạt động lúc gửi. Công việc đã thử giữ nguyên payload/key để retry an toàn; nếu đổi người nhận trong thời gian retry, chuyển `uncertain` để kiểm tra thủ công thay vì tự gửi lại nội dung khác.
- `pending`: đợi cron, backoff hoặc ngân sách. `sending`: đã claim; lease 120 giây phục hồi khi Worker chết. `accepted`: Resend nhận gửi. `failed`: lỗi vĩnh viễn ngay lần đầu. `uncertain`: có thể đã gửi, cần kiểm tra Resend. `expired`: hết hạn hoặc yêu cầu được đánh dấu spam trước gửi.
- Lỗi 429/5xx/network được retry, tối đa 6 attempts, backoff từ 60 giây tăng gấp đôi và tôn trọng `Retry-After`. Lỗi quota nhà cung cấp hoãn ít nhất một giờ. Lỗi 4xx cấu hình/địa chỉ không retry tự động (ngoại trừ xung đột idempotency còn xử lý).
- Mọi API attempt, gồm xác minh, test và retry, được giữ chỗ nguyên tử trong D1 và tính vào ngân sách. Hết ngân sách giữ nguyên tư vấn/outbox, không trả lỗi cho khách. Bản ghi attempts được dọn sau 31 ngày; outbox không tự xóa để còn lịch sử điều tra.
- Sender có lease toàn hệ thống 180 giây, xử lý tối đa 5 việc/lượt. Payload cố định và `Idempotency-Key` theo outbox ID hạn chế gửi trùng. Hạn outbox 20 giờ ngắn hơn thời gian Resend giữ key 24 giờ. Không cam kết gửi đúng một lần tuyệt đối.
- Không tự reset `uncertain`/`failed` trong DB: tra mã Resend/ID công việc, kiểm tra hộp thư và quyết định thủ công. Chi tiết tư vấn luôn còn trong `/admin/consultations`.
- `http_401`, `http_403`, `http_422`: kiểm tra key, quyền domain và địa chỉ From. `provider_quota`: kiểm tra quota trong Resend. `network_or_timeout`: kiểm tra mạng và nhật ký Resend. Log ứng dụng chỉ chứa nhãn cố định; không lưu response lỗi tự do của nhà cung cấp.
- Chưa có webhook phát thư/bounce. Không hiển thị “delivered” hoặc “read” dựa trên phản hồi gửi.

## Nghiệm thu code (28/10/2026)

- 289 unit/schema test qua, gồm 16 test email trên SQLite thật với provider giả.
- `npm run check`: 0 lỗi/cảnh báo; lint và Prettier cho các file thay đổi qua.
- `npm run build:local` qua. Build thường trên máy đang trỏ đến endpoint đọc nội dung D1 không truy cập được; dùng dữ liệu D1 local để kiểm tra build, không đổi cấu hình cá nhân.
- Kiểm HTTP và Chrome trên Worker build + DB `/tmp` riêng: đăng nhập bắt buộc, CSRF, GET không kích hoạt token, POST xác nhận một lần, token fragment → form → click xác nhận, form tư vấn hợp lệ/sai/honeypot/gửi trùng, outbox nguyên tử, scheduled handler; ảnh desktop 1440 và mobile 390, không tràn ngang toàn trang.
- Migration 0027 đã áp vào D1 local của dự án, mặc định `enabled = 0`. Chưa áp migration remote, gửi thật hay deploy; cần nghiệm thu staging trước production.

## Kiểm tra local

```sh
npm test
npm run check
npm run lint
npm run build
```

Để thử cron bằng Worker build local, dùng DB thử riêng (không dùng data production):

```sh
npx wrangler d1 migrations apply DB --local --persist-to /tmp/melatec-email-qa
npx wrangler dev --persist-to /tmp/melatec-email-qa --test-scheduled
```

Gọi `http://localhost:8787/cdn-cgi/local/scheduled?cron=*+*+*+*+*` để kích cron. Chỉ thử gửi thật khi đã đặt secret, origin và mailbox phù hợp trong `.dev.vars`; unit test dùng provider giả, không gửi ra Resend.

Nguồn đối chiếu ngày 28/10/2026: [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email), [idempotency trong 24 giờ](https://resend.com/docs/dashboard/emails/idempotency-keys), [quota và Retry-After](https://resend.com/docs/api-reference/rate-limit), [giá và hạn mức gói](https://resend.com/pricing), [Astro custom Worker entrypoint](https://docs.astro.build/en/guides/integrations-guide/cloudflare/), [Cloudflare scheduled handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/).
