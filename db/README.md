# Database (Cloudflare D1)

Schema, migration và dữ liệu mẫu cho database của website. Database là **Cloudflare D1** (SQLite), thay cho Supabase trước đây (chuyển ngày 2026-10-05). Quyết định đã chốt: chỉ một vai trò `admin`, không gửi email, chỉ tiếng Anh.

## Mô hình bảo mật

D1 **không có API công khai và không có RLS**. Chỉ hai đường vào:

| Đường vào                               | Ai dùng                        | Quyền                                                                                                           |
| --------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Binding `DB` trong Worker               | Mã của dự án chạy trên Workers | Toàn quyền, nên **mọi** quyền hạn do mã kiểm. Middleware xác thực mọi request `/admin/*` trước khi chạy handler |
| API Cloudflare (`CLOUDFLARE_API_TOKEN`) | Build và workflow publish (CI) | Token có quyền D1. Chỉ nằm trong secret của GitHub Environment, không ra trình duyệt                            |

Hệ quả cần nhớ: trước đây RLS là lớp phòng thủ thứ hai (quên kiểm quyền ở một trang thì DB vẫn chặn). **Giờ không còn lớp đó.** Quy tắc: route mới dưới `/admin` luôn được middleware che; route ngoài `/admin` không được đụng bảng nội dung hay yêu cầu tư vấn trừ `POST /api/consultation` (chỉ `insert`).

Đăng nhập (`src/lib/admin-auth.ts`, `src/lib/password.ts`): email + mật khẩu, băm PBKDF2-SHA256 bằng Web Crypto. Trình duyệt giữ một token ngẫu nhiên trong cookie `httpOnly` (`mt-session`, `path=/admin`, 7 ngày); DB chỉ lưu SHA-256 của token (`admin_sessions`), nên đăng xuất hoặc đổi mật khẩu vô hiệu hoá ngay. Không ai tự thêm mình làm admin được: không có route tạo tài khoản; tài khoản tạo bằng `npm run admin:create` (xem dưới).

## Các bảng

| Nhóm           | Bảng                                                                                                                                                                                                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quyền, vết     | `admins`, `admin_sessions` (chỉ `admin-auth.ts` đụng tới), `audit_logs` (ứng dụng ghi cùng batch với thay đổi)                                                                                                                                                                                                  |
| Nội dung       | `pages`, `page_sections` (JSON có `data_version`), `services`, `doctors`, `doctor_services`, `packages`, `package_items`, `locations`, `destinations`, `article_categories`, `articles`, `faqs`, `redirects`, `navigation_items`, `site_settings` (đúng 1 dòng, `id = 1`), `media_assets` (metadata, file ở R2) |
| Xuất bản       | `content_revisions` (snapshot bất biến), `publish_jobs` (queued → building → deployed / failed / superseded), view `live_revision`                                                                                                                                                                              |
| Yêu cầu tư vấn | `consultation_requests` (dữ liệu cá nhân, chỉ admin đọc)                                                                                                                                                                                                                                                        |

Các bảng nội dung là **bản làm việc**: sửa chúng không đổi trang public. Khi bấm Publish, ứng dụng chép nội dung vào một dòng `content_revisions` bất biến (trigger chặn UPDATE/DELETE), tạo `publish_jobs`, và build đọc đúng snapshot đó. Build lỗi thì site vẫn phục vụ bản deploy thành công trước (`live_revision`).

Ràng buộc đáng nhớ: tối đa một build đang chạy và một job đang chờ (partial unique index); form chống gửi trùng bằng `submission_id` duy nhất; ảnh đang được dùng không xoá được (`ON DELETE RESTRICT`).

## Khác biệt so với Postgres cũ

- Kiểu dữ liệu: id là UUID dạng text (DB tự sinh, mã cũng tự sinh để ghi được audit); thời gian là chuỗi ISO UTC (`2026-10-05T10:00:00.000Z`, so sánh được như chuỗi); boolean là 0/1; mảng và object là JSON text. **`src/lib/db.ts` đổi qua lại**, mã chỉ thấy boolean, mảng, object. Bảng nào có cột boolean/JSON mới thì khai báo trong `TABLES` ở `src/lib/db-schema.ts`.
- SQLite không có regex nên kiểm dạng (slug, path, link, email) dùng `GLOB`/`LIKE`; mã vẫn validate trước và báo lỗi thân thiện, ràng buộc DB là lớp cuối.
- `page_sections (page_id, sort_order)` không còn unique (SQLite không hoãn được unique); đổi chỗ section thì ghi lại thứ tự.
- Audit: không còn trigger biết "ai". Lớp truy vấn ghi `audit_logs` cùng batch (nguyên tử). Chỉ lưu cột đã đổi (cũ và mới); xoá chỉ lưu id; `consultation_requests` chỉ lưu `status` và `source_path`, **không bao giờ lưu họ tên, email, điện thoại, ghi chú**. Thay đổi làm bằng tay (`wrangler d1 execute`) không có audit.
- D1: tối đa **100 tham số mỗi câu lệnh** và 100 KB mỗi câu lệnh; một batch là một giao dịch.

## Chạy cục bộ

Không cần Docker hay tài khoản. `wrangler` mô phỏng D1 trong `.wrangler/state` (đã gitignore). Dùng Node theo `.nvmrc`.

```bash
npm run db:migrate   # áp dụng db/migrations vào D1 local
npm run db:seed      # nạp db/seed.sql vào D1 local (chạy lại được; không có giá, không bịa số)
npm run db:seed:staging  # nạp db/seed.sql vào D1 staging (KHÔNG BAO GIỜ production)
npm run db:reset     # xoá D1 local rồi migrate lại (mất cả tài khoản admin và dữ liệu thử)
npm run admin:create -- you@example.com   # tạo admin local (hỏi mật khẩu, không hiện khi gõ)
npm run preview      # build rồi chạy Worker + D1 local; đăng nhập ở http://localhost:8787/admin
npm test             # test schema, lớp truy vấn, đăng nhập, script publish (chạy trên SQLite thật)
```

`npm test` chạy migration thật trên SQLite trong bộ nhớ (`node:sqlite`) nên **không cần Cloudflare** để kiểm ràng buộc, audit, đăng nhập. Dữ liệu trong `db/seed.sql` lấy từ Figma và chưa được chủ dự án xác nhận (site, menu, 3 chi nhánh, 4 bác sĩ, 5 dịch vụ, 3 gói implant không giá, 1 điểm đến, 4 câu FAQ chưa có đáp án, 10 trang). Seed không tạo `page_sections`: section chưa sửa dùng chữ gốc ở `src/data/sections.ts`, và production vẫn bị chặn cho đến khi chủ dự án viết lại hoặc tắt 7 section có số liệu chưa xác nhận.

## Viết migration

- **Viết `BEGIN` và `END;` của trigger bằng chữ HOA.** `wrangler d1 migrations apply --remote` không nhận chữ thường (báo `incomplete input`), trong khi local và `npm test` vẫn chạy được.
- Tạo file mới trong `db/migrations` theo số thứ tự (`0002_ten.sql`); `wrangler d1 migrations create DB ten` làm giúp. Mỗi thay đổi một file.
- **Không sửa migration đã áp dụng lên staging/production.** Sai thì viết migration mới. (`0001_init.sql` gộp toàn bộ schema cũ; chưa áp dụng lên môi trường thật nào lúc viết.)
- SQLite sửa bảng hạn chế (`ALTER TABLE` không đổi/ràng buộc cột được): đổi ràng buộc phải tạo bảng mới, chép dữ liệu, đổi tên. Với D1 dùng `PRAGMA defer_foreign_keys = on` khi làm vậy. Tham khảo tài liệu Cloudflare về migration.
- Sau khi đổi cột: cập nhật kiểu `Row`/`Insert` và `TABLES` trong `src/lib/db-schema.ts`. Test `db-schema.test.ts` fail nếu cột trong migration và kiểu lệch nhau.
- Bảng chứa dữ liệu cá nhân: đặt `audit` giới hạn cột trong `TABLES`, không copy dữ liệu đó vào `audit_logs`.
- Bảng mới chỉ truy cập được qua `db.from()` khi đã khai báo trong `TABLES`; `admins`/`admin_sessions` cố ý không có.

## Tạo database trên Cloudflare (staging và production)

Chạy trong terminal của bạn (cần `wrangler login`). **Hai database riêng**: staging không bao giờ ghi vào dữ liệu production.

```bash
npx wrangler d1 create melatec-staging     # in ra database_id
npx wrangler d1 create melatec             # production
```

1. Sau mỗi lệnh `create`, **mở lại `wrangler.jsonc`**: wrangler có thể tự thêm một mục `d1_databases` mới (giống từng xảy ra với `r2_buckets`). Giữ đúng một mục `DB` mỗi môi trường, điền `database_id` thật thay cho `00000000-0000-0000-0000-000000000000` ở `d1_databases` mặc định (production) và ở `env.staging`. Chạy `npm run typegen`.
2. Áp dụng schema: `npm run db:migrate:staging`, `npm run db:migrate:production`. (`wrangler deploy` không tự chạy migration; **chạy migrate trước khi deploy bản có thay đổi schema**.)
3. Tạo tài khoản admin trên môi trường thật: `npm run admin:create -- you@example.com --remote --env staging` (production: bỏ `--env staging`). Mật khẩu ít nhất 12 ký tự.
4. Đặt `D1_DATABASE_ID` (Variable, không phải secret) trong GitHub Environment tương ứng; `CLOUDFLARE_API_TOKEN` của environment đó cần thêm quyền **D1: Edit**. Xem `PUBLISHING.md`.
5. Deploy: `npm run deploy:staging`. Thử đăng nhập ở `/admin/login`.

Đừng gửi API token hay mật khẩu cho ai, kể cả trong chat.

## Sao lưu

D1 có **Time Travel** (khôi phục về một thời điểm: 7 ngày gần nhất ở gói Free, 30 ngày ở Workers Paid): `npx wrangler d1 time-travel info DB --env staging`. Xuất file: `npx wrangler d1 export DB --remote --output backup.sql`. Nên xuất định kỳ `consultation_requests` vì đây là dữ liệu không dựng lại được.

## Giới hạn và chi phí (kiểm ngày 2026-10-05, xem tài liệu Cloudflare trước khi quyết định)

| Hạng mục                 | Free         | Workers Paid          |
| ------------------------ | ------------ | --------------------- |
| Số database / tài khoản  | 10           | 50.000                |
| Dung lượng mỗi database  | 500 MB       | 10 GB                 |
| Dòng đọc                 | 5 triệu/ngày | 25 tỷ/tháng đã gồm    |
| Dòng ghi                 | 100.000/ngày | 50 triệu/tháng đã gồm |
| Truy vấn mỗi lượt Worker | 50           | 1000                  |

Trang public dựng sẵn nên lượt xem không đọc D1; chỉ `/admin`, form tư vấn, build và publish dùng. Mỗi trang admin đọc vài truy vấn (huy hiệu yêu cầu mới ở mọi trang), rất xa mức Free.
