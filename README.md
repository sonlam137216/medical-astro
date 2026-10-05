# Melatec Dental Clinic: website

Website giới thiệu dịch vụ nha khoa kết hợp hỗ trợ khách quốc tế đến Việt Nam. Chỉ có tiếng Anh. Thiên về nội dung, hình ảnh, thông tin bác sĩ, gói dịch vụ và tiếp nhận yêu cầu tư vấn.

> **Trạng thái:** đang phát triển. Giao diện public, database (Cloudflare D1), form tư vấn, CMS `/admin`, media R2 và quy trình publish đã có ở mức code; staging đã thử, production chưa deploy. Xem [Lộ trình](#lộ-trình).

## Công nghệ

| Thành phần        | Công nghệ                                                            |
| ----------------- | -------------------------------------------------------------------- |
| Frontend          | Astro 7 + TypeScript (strict)                                        |
| Hosting, API, CDN | Cloudflare Workers + Static Assets (`@astrojs/cloudflare`)           |
| Database          | Cloudflare D1 (SQLite), truy cập qua binding `DB`                    |
| Đăng nhập admin   | Tự xây: mật khẩu PBKDF2 + session lưu trong D1 (không dịch vụ ngoài) |
| Media             | Cloudflare R2 (ảnh trang tĩnh vẫn ở `src/assets/images`)             |
| CMS               | Tự xây trong `/admin`, đang làm dần từng module                      |
| Font              | Inter (variable) và Cormorant Garamond, tự host qua `@fontsource`    |

Không dùng Stripe, video streaming, tài khoản khách hàng hay hồ sơ bệnh án. Chi tiết quyết định và đề xuất kiến trúc nằm ở [WEBSITE_TECHSTACK.md](./WEBSITE_TECHSTACK.md).

## Bắt đầu

Yêu cầu: Node.js **22.12 trở lên** (repo ghim 22.22.0 trong `.nvmrc`) và npm.

```bash
fnm use            # hoặc nvm use, nếu dùng trình quản lý phiên bản Node
npm install
npm run dev        # http://localhost:4321
```

Để thử gần với production nhất (Worker chạy cục bộ, có cả route động):

```bash
npm run preview    # build rồi chạy wrangler dev
```

## Lệnh

| Lệnh                                         | Tác dụng                                                      |
| -------------------------------------------- | ------------------------------------------------------------- |
| `npm run dev`                                | Dev server Astro                                              |
| `npm run build`                              | Build ra `dist/` (trang tĩnh + Worker)                        |
| `npm run preview`                            | Build rồi chạy `wrangler dev`                                 |
| `npm run check`                              | Sinh type Worker rồi chạy `astro check`                       |
| `npm run lint`                               | ESLint                                                        |
| `npm run format`                             | Prettier, ghi đè file                                         |
| `npm run format:check`                       | Prettier, chỉ kiểm tra (CI dùng lệnh này)                     |
| `npm test`                                   | Test schema, lớp truy vấn, đăng nhập, script publish (SQLite) |
| `npm run db:migrate`                         | Áp dụng `db/migrations` vào D1 local (xem `db/README.md`)     |
| `npm run db:seed`                            | Nạp dữ liệu mẫu vào D1 local                                  |
| `npm run db:reset`                           | Xoá D1 local rồi migrate lại                                  |
| `npm run db:migrate:staging` / `:production` | Áp dụng migration lên D1 thật (`--remote`)                    |
| `npm run admin:create`                       | Tạo admin hoặc đặt lại mật khẩu (`--remote`, `--env staging`) |
| `npm run typegen`                            | `wrangler types`, chạy lại sau khi sửa `wrangler.jsonc`       |
| `npm run deploy:staging`                     | Build với `CLOUDFLARE_ENV=staging` rồi `wrangler deploy`      |
| `npm run deploy:production`                  | Build rồi `wrangler deploy`                                   |

Hai lệnh deploy cần `wrangler login` và tài khoản Cloudflare. Chưa chạy lần nào.

CI (`.github/workflows/ci.yml`) chạy `format:check`, `lint`, `test`, `check` và `build` cho mỗi pull request và mỗi lần push lên `main`.

## Các trang hiện có

| Route                            | Nội dung (frame Figma)              |
| -------------------------------- | ----------------------------------- |
| `/`                              | Home                                |
| `/about`                         | About                               |
| `/services`                      | Services                            |
| `/services/dental-implants`      | Dental Implants (landing page)      |
| `/our-doctors`                   | Our Doctors                         |
| `/dental-packages`               | Dental Packages / Single Treatments |
| `/dental-packages/travel-combos` | Dental Packages / Travel Combos     |
| `/api/health`                    | Route động mẫu, trả `{"ok":true}`   |

Một số link trong menu và footer (ví dụ `/travel-guide`, `/dental-knowledge`) chưa có trang nên hiện 404. Các route này được đánh dấu `PROVISIONAL` trong `src/data/*.ts` vì Figma không ghi URL.

## Cấu trúc thư mục

```
src/
  assets/images/    ảnh xuất từ Figma (xem SOURCES.md trong thư mục này)
  components/       component dùng chung (Header, Footer, Button, Section, PageHero...)
    cards/          các loại thẻ (dịch vụ, bác sĩ, chi nhánh, gói giá...)
    home/           section riêng của trang Home
  data/             nội dung mẫu dạng TypeScript (dùng khi database chưa có nội dung đã publish)
  layouts/          BaseLayout (HTML shell) và SiteLayout (header, footer, form tư vấn)
  pages/            route của Astro
  styles/           tokens.css (màu, cỡ chữ, khoảng cách) và global.css
db/                 migration và seed của D1, hướng dẫn database (xem db/README.md)
scripts/            script CI (publish-job) và admin-user (tạo tài khoản admin)
tests/              test chạy bằng `node --test` (schema chạy trên SQLite thật)
wrangler.jsonc      cấu hình Cloudflare (production và staging)
.dev.vars.example   danh sách biến môi trường sẽ cần, copy thành .dev.vars khi chạy cục bộ
```

## Thiết kế

Nguồn thiết kế chính là file Figma của dự án. Giá trị trong `src/styles/tokens.css` được đo từ Figma: màu lấy từ swatch của các color style, cỡ chữ và khoảng cách đọc từ panel thiết kế. Font serif của tiêu đề không được ghi tên trong Figma, đang dùng Cormorant Garamond vì độ rộng chữ khớp, cần chủ dự án xác nhận.

Figma chỉ có bản desktop 1440px. Responsive mobile/tablet và menu thu gọn là phần tự bổ sung.

## Lưu ý trước khi ra mắt

- **Nội dung trong code lấy nguyên từ Figma và nhiều chỗ là dữ liệu mẫu**: thẻ dịch vụ lặp lại, giá "600$" và "C$1,250", số liệu "30,000+ khách", "4.9/5 Google Reviews", thông tin bác sĩ. Cần chủ dự án xác nhận hoặc thay thế. Các chỗ này được đánh dấu `PLACEHOLDER` trong `src/data/*.ts`.
- **Ảnh cần xác nhận quyền sử dụng**: ảnh trước/sau có người thật, ảnh X-quang, ảnh có chữ quảng cáo tiếng Việt in sẵn. Chi tiết ở `src/assets/images/SOURCES.md`.
- Site đang `noindex` (xem `src/layouts/SiteLayout.astro`). Gỡ khi sẵn sàng cho công cụ tìm kiếm.
- Form tư vấn gửi POST tới `/api/consultation` và lưu vào D1; không gửi email, xem yêu cầu ở `/admin`.
- Không commit `.dev.vars`, `.env*`, token Cloudflare, token GitHub hay mật khẩu admin. Các file này đã nằm trong `.gitignore`.

## Lộ trình

1. ~~Khởi tạo Astro + Cloudflare~~ xong.
2. ~~UI public theo Figma~~ xong ở mức bố cục, còn tinh chỉnh.
3. Database Cloudflare D1, migration, đăng nhập admin, chỉ một vai trò `admin`: **xong ở mức code và test local; chưa tạo D1 thật** (xem `db/README.md`).
4. ~~Form tư vấn~~ xong ở mức code (validate phía server, lưu DB, chống spam, không gửi email).
5. CMS `/admin` và media R2: đang làm (bác sĩ, site, menu, pages, redirects, FAQ, media đã có).
6. Quy trình draft, publish, build, deploy: đã chạy thật trên staging trước khi đổi sang D1; cần chạy lại sau khi tạo D1.
7. Nghiệm thu hiệu năng quốc tế, bảo mật, SEO, go-live.

## Tài liệu liên quan

- [WEBSITE_TECHSTACK.md](./WEBSITE_TECHSTACK.md): bối cảnh, quyết định, kiến trúc đề xuất, chi phí.
- [CLAUDE.md](./CLAUDE.md): quy tắc làm việc và trạng thái chi tiết cho trợ lý AI, gồm cách đọc Figma an toàn.
