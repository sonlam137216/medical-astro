# Xuất bản nội dung (Publish → build → deploy)

Nút **Publish** trong `/admin/publish` không build trong Worker. Nó lưu một revision bất biến rồi nhờ GitHub Actions chạy workflow `.github/workflows/publish.yml`. Workflow build site từ đúng revision đó và deploy lên Cloudflare, rồi ghi tiến độ vào bảng `publish_jobs` để trang Publish hiển thị.

```
Admin bấm Publish
  → Worker: lưu content_revisions + publish_jobs (queued)
  → Worker gọi GitHub API (workflow_dispatch: job_id, revision_id, target)
  → GitHub Actions: queued → building → build (CONTENT_REVISION_ID) → wrangler deploy → deployed
                                              └─ lỗi ở bước nào: failed, bản đang live giữ nguyên
```

- **Cùng lúc chỉ một build** mỗi môi trường (`concurrency`). Publish mới trong lúc đang build thì chờ; Publish thứ ba thay thế bản đang chờ (job cũ thành `superseded`).
- **"Đã lưu" khác "đã live".** Trang Publish chỉ nói một revision là live khi job của nó đạt `deployed`.
- Build lỗi thì **không deploy**, bản trước vẫn được phục vụ. Nút **Build again** thử lại revision mới nhất.
- Job `building` quá 60 phút (runner chết) bị tự đánh dấu `failed` ở lần build kế tiếp.

## Thiết lập một lần

Làm theo thứ tự. Bước 1 và 5 cần chạy lệnh, các bước còn lại làm trên web.

1. **Đẩy code lên GitHub** (`git push`). Workflow phải có trên nhánh `main` thì GitHub mới chạy được.
2. **Cloudflare API token** (cho GitHub Actions deploy và đọc/ghi D1): dash.cloudflare.com → My Profile → API Tokens → Create Token → mẫu **Edit Cloudflare Workers**, rồi **thêm quyền Account → D1 → Edit** → chọn đúng tài khoản. Ghi lại cả **Account ID** (cột phải trang Workers & Pages).
3. **GitHub Environment `staging`**: repo → Settings → Environments → New environment → `staging`. Thêm **secrets**:

   | Secret                  | Giá trị        |
   | ----------------------- | -------------- |
   | `CLOUDFLARE_API_TOKEN`  | token ở bước 2 |
   | `CLOUDFLARE_ACCOUNT_ID` | Account ID     |

   Biến (Variables, không phải secret): **`D1_DATABASE_ID`** (id database của môi trường này, lấy từ `wrangler d1 create`, bắt buộc: build và script `publish-job` đọc/ghi D1 qua API Cloudflare bằng id này). Tuỳ chọn: `R2_PUBLIC_BASE_URL` (URL công khai của bucket khi đã có custom domain; để trống thì ảnh đi qua Worker).
   Biến tuỳ chọn cho **ra mắt** (đọc lúc build, ghi vào `.dev.vars` bởi workflow): `SITE_URL` (địa chỉ công khai, ví dụ `https://melatec.vn`: dùng cho canonical, thẻ chia sẻ, JSON-LD và `sitemap.xml`) và `SITE_INDEXABLE` (`true` để gỡ `noindex`; **chỉ có tác dụng ở environment `production` và khi đã có `SITE_URL`**). Để trống cả hai thì mọi trang vẫn `noindex` và `robots.txt` chặn tất cả. `TURNSTILE_SITE_KEY`: xem mục 'Chống spam form (Turnstile)' bên dưới.
   Khi làm production, tạo thêm environment `production` với bộ secret riêng và bật **Required reviewers** để có người duyệt trước khi deploy.

4. **Token cho Worker khởi động workflow** (không phải token ở bước 2): GitHub → Settings → Developer settings → Fine-grained personal access tokens → Generate. Chọn **Only select repositories** = repo này, quyền **Actions: Read and write** (Metadata read tự có). Đặt hạn ngắn (ví dụ 90 ngày) và ghi lịch gia hạn. Token này chỉ khởi động được workflow, không đọc được code.
5. **Đặt secret cho Worker rồi deploy** (tự nhập, đừng dán token vào chat):

   ```bash
   npx wrangler secret put GITHUB_DISPATCH_TOKEN --env staging
   npm run deploy:staging      # đưa các biến GITHUB_REPO, GITHUB_WORKFLOW, PUBLISH_TARGET lên Worker
   ```

   Với production: `--env` bỏ trống, và `PUBLISH_TARGET` của Worker production là `production` (khai báo trong `wrangler.jsonc`).

## Ra mắt: cho công cụ tìm kiếm thấy website

Chỉ làm khi nội dung thật đã có và `npm run check:launch` sạch.

1. Đặt biến `SITE_URL` và `SITE_INDEXABLE=true` trong GitHub Environment `production` (xem bước 3).
2. Publish lên production. Bản build sẽ: bỏ `noindex`, thêm canonical, thẻ `og:*`/`twitter:*`, JSON-LD (Home: `Dentist`, bài viết: `Article`, FAQ có đáp án: `FAQPage`), `robots.txt` (chặn `/admin/`, `/api/`, nêu sitemap) và `sitemap.xml` (mọi trang, trừ trang đã ẩn ở Pages (SEO)).
3. Kiểm tra: mở `https://<tên miền>/robots.txt`, `/sitemap.xml`, xem mã nguồn Home có `<link rel="canonical">`. Gửi `sitemap.xml` cho Google Search Console.
4. Từng trang có thể giữ ngoài công cụ tìm kiếm ở admin 'Pages (SEO)' (ô 'Hide this page from search engines'); ảnh chia sẻ riêng của trang cũng chọn ở đó. Trang không có ảnh riêng dùng `public/og-default.jpg` (1200×630).
5. Staging không bao giờ có `SITE_INDEXABLE` (workflow chỉ ghi biến này khi target là `production`), nên staging luôn `noindex`.

`npm run check:seo` (build thường) và `npm run check:seo -- --site=https://…` (build đã đặt `SITE_URL` + `SITE_INDEXABLE=true`) kiểm các điều trên; CI chạy cả hai.

### Xác minh quyền sở hữu với Google Search Console / Bing Webmaster Tools

**Cách ưu tiên: bản ghi DNS TXT.** Google Search Console → Add property → chọn **Domain** (`melatec.vn`, không có `https://`) → chép bản ghi `google-site-verification=…` → thêm bản ghi **TXT** ở DNS của tên miền (Cloudflare dashboard → DNS → Add record, name `@`). Cách này xác minh cả tên miền (mọi subdomain, http và https), không phụ thuộc vào website, và không mất khi sửa nội dung hay build lại. Bing Webmaster Tools: dùng 'Import from Google Search Console' (sau khi Google đã xác minh), hoặc thêm bản ghi DNS mà Bing đưa.

**Cách dự phòng: thẻ meta ở Home** (khi không sửa được DNS, hoặc Search Console dùng property kiểu 'URL prefix'):

1. Search Console → 'URL prefix' (`https://<tên miền>`) → chọn **HTML tag**, chép thẻ `<meta name="google-site-verification" content="…" />`. Bing: 'HTML Meta Tag', thẻ `<meta name="msvalidate.01" content="…" />`.
2. Admin → **Site details** → nhóm 'Search engine verification': dán cả thẻ hoặc chỉ phần `content` vào đúng ô (Google / Bing). Khi lưu, thẻ được rút lại còn mã (chữ, số, `-`, `_`, 8–128 ký tự); dán thẻ của Bing vào ô Google, thẻ khác, hoặc mã có ký tự lạ thì báo lỗi.
3. **Publish lên production** và chờ build xong. Thẻ chỉ được in trong `<head>` của **Home**, và chỉ ở bản build indexable (`SITE_URL` + `SITE_INDEXABLE=true`): staging/local không bao giờ có thẻ này (staging luôn `noindex`, nên cũng không xác minh được ở đó).
4. Mở mã nguồn `https://<tên miền>/` kiểm thấy thẻ, rồi bấm **Verify** ở Search Console / Bing.
5. **Giữ nguyên mã** sau khi đã xác minh: Google định kỳ kiểm lại, xoá mã thì mất quyền sở hữu.

Không có script bên thứ ba và CSP không đổi (chỉ là thẻ `<meta>`). `check:seo` báo lỗi nếu thẻ xuất hiện ngoài Home hoặc trên bản build không indexable. Tracking (GA4, GTM, Pixel) **chưa làm**: kéo theo CSP, đồng ý cookie và hiệu năng, cần chủ dự án quyết trước.

## Chống spam form (Turnstile)

Tuỳ chọn, bật khi thấy spam ở hộp thư tư vấn. Cần **cả hai** cùng lúc:

1. Cloudflare dashboard → Turnstile → Add site (tên miền của website) → lấy **Site key** và **Secret key**.
2. Secret: `npx wrangler secret put TURNSTILE_SECRET_KEY` (thêm `--env staging` cho staging). Từ lúc này server yêu cầu token hợp lệ cho mọi yêu cầu tư vấn.
3. Site key: đặt biến `TURNSTILE_SITE_KEY` trong GitHub Environment tương ứng rồi Publish (site key được ghi vào form lúc build và được thêm vào Content-Security-Policy).

Chỉ đặt secret mà thiếu site key: form ngừng nhận yêu cầu (không có token). Chỉ đặt site key: hiện widget nhưng server không kiểm. Trình duyệt tắt JavaScript không qua được kiểm tra. Widget chỉ tải khi khách bắt đầu điền form (không làm chậm trang), ở chế độ 'interaction-only' (thường không hiện gì). Thử cục bộ bằng key thử của Cloudflare: site key `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA` (luôn pass).

## Kiểm tra

1. Mở `/admin/publish`, sửa một bác sĩ rồi bấm **Publish**.
2. Trang báo "The build has been started". Trong tab Actions của repo thấy một lần chạy **Publish**.
3. Vài phút sau tải lại trang Publish: job thành `deployed` và mục **On the website** ghi revision mới.

## Sự cố thường gặp

| Dấu hiệu                                          | Nguyên nhân thường gặp                                                                                                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The build trigger is not set up here"            | Worker thiếu secret `GITHUB_DISPATCH_TOKEN` (hoặc chạy local). Revision vẫn được lưu.                                                                                                        |
| Job `failed`: "GitHub did not accept the request" | Token hết hạn/thiếu quyền Actions, workflow chưa có trên `main`, hoặc sai `GITHUB_REPO`. Sửa rồi bấm **Build again**.                                                                        |
| Job `failed`: "The build did not complete"        | Mở **Build log** trên trang Publish. Hay gặp: sai secret trong GitHub Environment, token Cloudflare thiếu quyền (nhất là **D1: Edit**), thiếu biến `D1_DATABASE_ID`, bucket R2 chưa tồn tại. |
| Job `queued` mãi                                  | GitHub chưa chạy (đang chờ build trước) hoặc workflow bị tắt trong repo.                                                                                                                     |

## Lưu ý bảo mật

- `GITHUB_DISPATCH_TOKEN` và `CLOUDFLARE_API_TOKEN` (token này sửa được cả database) chỉ nằm ở secret của Worker hoặc GitHub Environment, không commit, không ra trình duyệt.
- Workflow ghi `.dev.vars` tạm trên máy chạy để build đọc được revision; file này không được commit và máy chạy bị huỷ sau mỗi lần.
- Script `scripts/publish-job.mjs` chỉ ghi id và thông báo cố định vào DB, không ghi output của build.
- **Staging và production dùng hai database D1 riêng** (`melatec-staging`, `melatec`), nên Publish ở staging không đụng dữ liệu production. Revision là bất biến, không xoá được: đừng Publish dữ liệu thử lên production.
- **Migration không tự chạy khi deploy.** Thay đổi schema thì chạy `npm run db:migrate:staging` / `db:migrate:production` trước khi deploy.
- Sau khi chạy `wrangler r2 bucket create` hoặc `wrangler d1 create`, mở lại `wrangler.jsonc`: lệnh này có thể tự thêm binding lạ (đã từng thêm `melatec_media`).
