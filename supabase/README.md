# Database (Supabase)

Schema, migration, RLS và test cho PostgreSQL của Supabase. Quyết định đã chốt: chỉ một vai trò `admin`, không gửi email, chỉ tiếng Anh.

## Lưu ý cấu hình Auth local

Trong `config.toml`, `[auth.email] enable_signup` bật/tắt **cả nhà cung cấp email** (kể cả đăng nhập), không chỉ đăng ký. Giữ `true` để admin đăng nhập được; việc cấm đăng ký người lạ do `[auth] enable_signup = false` đảm nhiệm (đã kiểm: đăng nhập được, đăng ký trả `signup_disabled`). Trên project thật, tương ứng là tắt "Allow new users to sign up" nhưng vẫn bật Email provider.

## Mô hình bảo mật

| Vai trò                        | Quyền                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| `anon` (khách truy cập)        | **Không truy cập bảng nào.** Trang public là HTML tĩnh, không đọc DB khi xem trang.         |
| `authenticated` + là admin     | Đọc và sửa toàn bộ nội dung, xem và xử lý yêu cầu tư vấn. Admin là một dòng trong `admins`. |
| `authenticated` không là admin | Không thấy gì, không sửa được gì.                                                           |
| Secret key (`service_role`)    | Bỏ qua RLS. Chỉ dùng ở server (form tư vấn, build). **Không bao giờ đưa ra browser.**       |

Không ai tự thêm mình làm admin được: bảng `admins` không có quyền ghi qua API. Thêm admin bằng SQL Editor (xem bên dưới).

## Các bảng

| Nhóm           | Bảng                                                                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Quyền, vết     | `admins`, `audit_logs` (chỉ thêm, không sửa/xóa; ghi bằng trigger)                                                                                                                                                                                                                   |
| Nội dung       | `pages`, `page_sections` (JSONB có `data_version`), `services`, `doctors`, `doctor_services`, `packages`, `package_items`, `locations`, `destinations`, `articles`, `faqs`, `redirects`, `navigation_items`, `site_settings` (đúng 1 dòng), `media_assets` (metadata, file nằm ở R2) |
| Xuất bản       | `content_revisions` (snapshot bất biến), `publish_jobs` (queued → building → deployed / failed / superseded), view `live_revision`                                                                                                                                                   |
| Yêu cầu tư vấn | `consultation_requests` (dữ liệu cá nhân, chỉ admin đọc)                                                                                                                                                                                                                             |

Các bảng nội dung là **bản làm việc**: sửa chúng không đổi trang public. Khi bấm Publish, ứng dụng chép toàn bộ nội dung vào một dòng `content_revisions` bất biến, tạo `publish_jobs`, và build đọc đúng snapshot đó. Build lỗi thì site vẫn phục vụ bản deploy thành công trước (`live_revision`).

Một số ràng buộc đáng nhớ: tối đa một build đang chạy và một job đang chờ; `content_revisions` không sửa/xóa được kể cả bằng secret key; form chống gửi trùng bằng `submission_id` duy nhất; thứ tự section dùng ràng buộc unique hoãn (deferred) để đổi chỗ nhiều section trong một giao dịch.

## Chạy cục bộ

Cần Docker đang chạy. Lần đầu sẽ tải image (vài trăm MB).

```bash
npm run db:start     # chỉ khởi động Postgres local, áp dụng migration
npm run db:reset     # tạo lại DB từ migration + supabase/seed.sql (chỉ dùng cho local)
npm run db:test      # chạy test pgTAP trong supabase/tests/database
npm run db:lint      # kiểm tra các hàm SQL
npm run db:types     # sinh src/types/database.ts từ schema local
npm run db:stop
```

`supabase/seed.sql` chỉ chạy ở local và **không có giá** (không bịa số). Dữ liệu trong đó lấy từ Figma và chưa được chủ dự án xác nhận.

Sau mỗi thay đổi schema: viết migration mới, chạy `db:reset`, `db:test`, `db:types`, rồi commit cả migration lẫn `src/types/database.ts`.

## Viết migration

- Tạo bằng `npx supabase migration new <ten>`; mỗi thay đổi một file mới.
- **Không sửa migration đã áp dụng lên project thật.** Sai thì viết migration mới sửa lại.
- Bảng mới phải bật RLS và có policy `admin` ngay trong cùng migration, và có test trong `supabase/tests/database`. Test `rls.test.sql` sẽ fail nếu có bảng nào ở schema `public` chưa bật RLS.
- Bảng chứa dữ liệu cá nhân: không copy dữ liệu đó vào `audit_logs`.

## Đẩy lên project Supabase thật

**Đã đẩy lên (2026-10-05): 4 migration đã áp dụng. Không sửa các file này nữa; sai thì viết migration mới.** Không drop bảng tay trên Dashboard: lịch sử migration sẽ lệch với DB thật. Cần làm lại từ đầu thì xoá sạch object do migration tạo (bảng, function, domain), chạy `npx supabase migration repair --status reverted <version>` cho từng migration rồi `db push` lại.

Project hiện tại: `npbiucxxcnppgecmkhdz` (`https://npbiucxxcnppgecmkhdz.supabase.co`). Chạy trong terminal của bạn, tại thư mục dự án, vì có bước đăng nhập và nhập mật khẩu DB:

```bash
npx supabase login                                   # mở trình duyệt để đăng nhập
npx supabase link --project-ref npbiucxxcnppgecmkhdz # hỏi database password (mật khẩu bạn đặt lúc tạo project)
npx supabase db push --dry-run                       # xem trước, chưa thay đổi gì
npx supabase db push                                 # áp dụng 4 migration
```

`db push` không chạy `seed.sql`. Đừng gửi database password hay access token cho ai, kể cả trong chat.

Cấu hình `supabase/config.toml` chỉ áp dụng cho local. Với project thật, các thiết lập sau làm trong dashboard:

1. **Authentication → Sign In / Providers:** tắt "Allow new users to sign up".
2. **Authentication → Users → Add user → Create new user:** tạo tài khoản admin (tick Auto Confirm User, vì không gửi email).
3. Đánh dấu tài khoản đó là admin, chạy trong **SQL Editor**:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'EMAIL_ADMIN_CUA_BAN';
   ```

4. Kiểm tra: **Database → Tables**, mọi bảng ở `public` phải hiện nhãn RLS bật. Có thể chạy thêm **Advisors → Security** để xem cảnh báo.

## Khóa và biến môi trường

| Biến                       | Dùng ở              | Ghi chú                                  |
| -------------------------- | ------------------- | ---------------------------------------- |
| `SUPABASE_URL`             | server              | Không bí mật                             |
| `SUPABASE_PUBLISHABLE_KEY` | server              | `sb_publishable_…`, an toàn nếu RLS đúng |
| `SUPABASE_SECRET_KEY`      | **chỉ server / CI** | `sb_secret_…`, bỏ qua RLS                |

Local: copy `.dev.vars.example` thành `.dev.vars` (không commit). Cloudflare: đặt riêng cho từng môi trường bằng `wrangler secret put`. Staging không dùng key của production.

## Gói Free

Project tự pause sau khoảng một tuần không hoạt động và không có backup tự động. Nâng lên Pro trước khi go-live, hoặc tự export định kỳ.
