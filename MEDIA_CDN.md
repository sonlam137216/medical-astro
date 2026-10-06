# CDN cho ảnh và video (R2)

Ảnh và video do CMS quản lý nằm trong bucket R2 (`melatec-media`, staging: `melatec-media-staging`). Hai cách phục vụ:

| Cách                                             | Khi nào                  | Ghi chú                                                                                                                                                                      |
| ------------------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route Worker `/media/*` (mặc định)               | local, staging           | Mỗi lượt tải ảnh/video là một request Worker (tính quota, có thể chậm hơn). Hỗ trợ `Range` (tua video), `ETag`/304, `immutable`.                                             |
| Custom domain trên bucket + `R2_PUBLIC_BASE_URL` | **production** (nên làm) | Khách tải thẳng từ mạng lưới Cloudflare, có cache ở edge, không tốn request Worker. Cần một domain đã nằm trong Cloudflare. Chưa làm được cho đến khi chủ dự án chọn domain. |

## Thiết lập custom domain (một lần, trên Cloudflare dashboard)

1. R2 → bucket `melatec-media` → **Settings → Custom Domains → Connect Domain**, ví dụ `media.<domain-của-site>`. Domain phải thuộc một zone trong cùng tài khoản.
2. **Đừng bật** `r2.dev` cho bucket production (không có cache, bị giới hạn tốc độ). Với staging, bật `r2.dev` là cách nhanh để thử CDN khi chưa có domain, không dùng cho production.
3. **Chỉ để file công khai trong bucket.** Custom domain mở cả bucket: ai biết key đều tải được. CMS chỉ ghi vào `media/<id>/v<N>/…`; đừng đặt file riêng tư vào bucket này.
4. Cache: mọi object đã được ghi `Cache-Control: public, max-age=31536000, immutable` (key có phiên bản nên nội dung không bao giờ đổi). Cloudflare tự cache `.webp` và `.mp4`. Không cần Cache Rule riêng; nếu muốn chắc chắn, thêm rule "Cache eligibility: Eligible for cache" cho hostname media.
5. Đặt `R2_PUBLIC_BASE_URL=https://media.<domain>` trong **GitHub Environment** (Variables) của môi trường đó rồi Publish lại. Biến chỉ có tác dụng lúc build (URL ảnh được ghi vào HTML), và build sẽ tự thêm `<link rel="preconnect">` tới domain media.
6. Không cần CORS: ảnh và video tải bằng thẻ `<img>`/`<video>`. Chỉ thêm CORS nếu sau này trang gọi `fetch()` tới domain media.

## Kiểm tra sau khi bật

- `curl -sI https://media.<domain>/media/<id>/v1/480.webp` → `cf-cache-status: HIT` ở lần gọi thứ hai, `cache-control: …immutable`.
- Video: `curl -s -o /dev/null -D - -H 'Range: bytes=0-99' https://media.<domain>/media/<id>/v1/video.mp4` → `206 Partial Content`.
- Đo LCP/INP với cả cache miss và cache hit; đừng báo kết quả cache hit đơn lẻ.

## Ảnh

- Ảnh mẫu đi kèm site (`src/assets/images`): Astro tối ưu lúc build (WebP, 1x/2x, khai báo kích thước, hero tải ngay với `fetchpriority="high"`, ảnh còn lại lazy), phục vụ từ `/_astro/` với cache `immutable`.
- Ảnh trong thư viện media: trình duyệt của admin tạo bản WebP 480/960/1600 px lúc upload (xem `src/scripts/media-upload.ts`), trang public dùng `srcset`. Ảnh ở đầu trang dùng `<ProfileImage priority />` để tải sớm.

## Video

- **Không chuyển mã.** File MP4 được lưu nguyên, nên phải chuẩn bị trước khi upload (H.264 + AAC, **faststart** để phát được trước khi tải xong), ví dụ:
  `ffmpeg -i in.mov -c:v libx264 -crf 26 -preset slow -vf scale=-2:720 -c:a aac -b:a 96k -movflags +faststart out.mp4`
- Server từ chối file không phải MP4 và MP4 không có faststart (đọc box `ftyp`/`moov`/`mdat`, không tin trình duyệt). Giới hạn 80 MB mỗi file (request Worker tối đa 100 MB).
- Trang public dùng `<Video video={…} />`: `preload="none"` (không tải gì cho đến khi bấm phát), ảnh bìa (poster) từ thư viện ảnh, giữ chỗ theo tỉ lệ để không nhảy bố cục. Không autoplay.
- Video lớn hơn 80 MB cần upload trực tiếp lên R2 bằng URL ký sẵn (cần S3 credentials của R2 làm secret): chưa làm, chỉ làm khi có nhu cầu thật.
