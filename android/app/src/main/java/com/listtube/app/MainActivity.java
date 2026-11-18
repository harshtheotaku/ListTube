package com.listtube.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlarmManager;
import android.app.Dialog;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayInputStream;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private boolean bridgeConfigured = false;
    private String pendingOAuthUrl = null;
    private String pendingShortcutTab = null;

    @SuppressLint("SourceLockedOrientationActivity")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        super.onCreate(savedInstanceState);
        captureIncomingIntent(getIntent());

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView == null) {
                    finish();
                    return;
                }
                webView.evaluateJavascript(
                    "(function(){ return window.__anitubeHandleBack ? window.__anitubeHandleBack() : false; })()",
                    result -> {
                        if ("true".equals(result)) {
                            return;
                        }
                        finish();
                    }
                );
            }
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    public void onStart() {
        super.onStart();
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;

        WebSettings settings = webView.getSettings();
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(false);
        settings.setLoadWithOverviewMode(false);
        settings.setTextZoom(100);

        if (!bridgeConfigured) {
            webView.addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void exitApp() {
                    runOnUiThread(() -> finish());
                }

                @JavascriptInterface
                public void openInAppBrowser(String url, String title) {
                    if (url == null || (!url.startsWith("https://") && !url.startsWith("http://"))) {
                        return;
                    }
                    runOnUiThread(() -> showGuardedInAppBrowser(url, title));
                }

                @JavascriptInterface
                public void haptic(String kind) {
                    runOnUiThread(() -> {
                        int feedback = HapticFeedbackConstants.KEYBOARD_TAP;
                        if ("medium".equals(kind)) {
                            feedback = Build.VERSION.SDK_INT >= 27
                                ? HapticFeedbackConstants.KEYBOARD_PRESS
                                : HapticFeedbackConstants.VIRTUAL_KEY;
                        } else if ("success".equals(kind)) {
                            feedback = Build.VERSION.SDK_INT >= 30
                                ? HapticFeedbackConstants.CONFIRM
                                : HapticFeedbackConstants.LONG_PRESS;
                        }
                        webView.performHapticFeedback(feedback);
                    });
                }

                @JavascriptInterface
                public void scheduleAiringAlert(String id, String title, String body, double triggerAtMs) {
                    if (id == null || id.isEmpty()) return;
                    long when = (long) triggerAtMs;
                    if (when <= System.currentTimeMillis() + 5000L) return;
                    runOnUiThread(() -> {
                        if (Build.VERSION.SDK_INT >= 33 &&
                            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 4201);
                        }
                        AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                        if (am == null) return;
                        Intent intent = new Intent(MainActivity.this, AiringAlertReceiver.class);
                        intent.putExtra(AiringAlertReceiver.EXTRA_ALERT_ID, id);
                        intent.putExtra(AiringAlertReceiver.EXTRA_TITLE, title);
                        intent.putExtra(AiringAlertReceiver.EXTRA_BODY, body);
                        PendingIntent pi = PendingIntent.getBroadcast(
                            MainActivity.this,
                            id.hashCode(),
                            intent,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                        );
                        am.set(AlarmManager.RTC_WAKEUP, when, pi);
                    });
                }

                @JavascriptInterface
                public void cancelAiringAlert(String id) {
                    if (id == null || id.isEmpty()) return;
                    runOnUiThread(() -> {
                        AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                        if (am == null) return;
                        Intent intent = new Intent(MainActivity.this, AiringAlertReceiver.class);
                        PendingIntent pi = PendingIntent.getBroadcast(
                            MainActivity.this,
                            id.hashCode(),
                            intent,
                            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
                        );
                        if (pi != null) {
                            am.cancel(pi);
                            pi.cancel();
                        }
                    });
                }
            }, "ListTubeNative");
            bridgeConfigured = true;
        }

        flushPendingIntents(webView);
    }

    private static final List<String> AD_HOST_MARKERS = Arrays.asList(
        "doubleclick.", "googlesyndication.", "googleadservices.", "google-analytics.",
        "popads.", "popcash.", "adsterra", "propellerads", "hilltopads",
        "exoclick.", "juicyads.", "trafficjunky.", "clickadu.", "monetag.",
        "onclickalgo", "adtng.", "tsyndicate.", "taboola.", "outbrain.",
        "histats.", "mc.yandex.", "yandexadexchange.", "adskeeper.", "mgid.",
        "adnxs.", "criteo.", "rubiconproject.", "pubmatic.", "openx.",
        "acscdn.", "alexametrics.", "realsrv.", "twinrdsrv.", "1xbet", "bet365"
    );

    private static final List<String> ALLOWED_EMBED_HOST_MARKERS = Arrays.asList(
        "vidstream", "megacloud", "rabbitstream", "dokicloud", "filemoon",
        "streamtape", "mp4upload", "kwik.", "sibnet.", "sendvid.", "yourupload.",
        "streamwish", "doodstream", "voe.", "cloudflare.", "challenges.cloudflare.",
        "hcaptcha.", "recaptcha.", "youtube.", "youtu.be", "mangadex.", "comix.",
        "kotoplay."
    );

    private static boolean isAllowedEmbedOrChallengeHost(String host) {
        if (host == null) return false;
        String lower = host.toLowerCase(Locale.US);
        for (String marker : ALLOWED_EMBED_HOST_MARKERS) {
            if (lower.contains(marker)) return true;
        }
        return false;
    }

    private static boolean isAdOrTrackerHost(String host) {
        if (host == null) return false;
        String lower = host.toLowerCase(Locale.US);
        for (String marker : AD_HOST_MARKERS) {
            if (lower.contains(marker)) return true;
        }
        return false;
    }

    private static String baseDomain(String host) {
        if (host == null) return "";
        String clean = host.toLowerCase(Locale.US);
        String[] parts = clean.split("\\.");
        if (parts.length >= 2) {
            return parts[parts.length - 2] + "." + parts[parts.length - 1];
        }
        return clean;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void showGuardedInAppBrowser(String initialUrl, String rawTitle) {
        Uri parsedInitial = Uri.parse(initialUrl);
        final String initialDomain = baseDomain(parsedInitial.getHost());
        final AtomicInteger blockedCount = new AtomicInteger(0);

        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR);

        Dialog dialog = new Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#0B0B0E"));

        int pad = (int) (10 * getResources().getDisplayMetrics().density);

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setBackgroundColor(Color.parseColor("#141418"));
        toolbar.setPadding(pad, pad / 2, pad, pad / 2);

        TextView backBtn = new TextView(this);
        backBtn.setText("‹ Back");
        backBtn.setTextColor(Color.WHITE);
        backBtn.setTextSize(14f);
        backBtn.setPadding(pad, pad / 2, pad, pad / 2);

        LinearLayout titleWrap = new LinearLayout(this);
        titleWrap.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        titleWrap.setLayoutParams(titleParams);

        TextView titleView = new TextView(this);
        titleView.setText(rawTitle != null && !rawTitle.isEmpty() ? rawTitle : initialDomain);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(13f);
        titleView.setSingleLine(true);
        titleView.setEllipsize(TextUtils.TruncateAt.END);

        TextView shieldView = new TextView(this);
        shieldView.setText("Shield Active · 0 popups/ads blocked");
        shieldView.setTextColor(Color.parseColor("#34D399"));
        shieldView.setTextSize(10.5f);
        shieldView.setSingleLine(true);

        titleWrap.addView(titleView);
        titleWrap.addView(shieldView);

        TextView reloadBtn = new TextView(this);
        reloadBtn.setText("↻");
        reloadBtn.setTextColor(Color.LTGRAY);
        reloadBtn.setTextSize(16f);
        reloadBtn.setPadding(pad, pad / 2, pad, pad / 2);

        TextView closeBtn = new TextView(this);
        closeBtn.setText("✕");
        closeBtn.setTextColor(Color.WHITE);
        closeBtn.setTextSize(15f);
        closeBtn.setPadding(pad, pad / 2, pad, pad / 2);

        toolbar.addView(backBtn);
        toolbar.addView(titleWrap);
        toolbar.addView(reloadBtn);
        toolbar.addView(closeBtn);

        FrameLayout container = new FrameLayout(this);
        LinearLayout.LayoutParams containerParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f
        );
        container.setLayoutParams(containerParams);

        WebView viewer = new WebView(this);
        WebSettings ws = viewer.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setSupportMultipleWindows(false);
        ws.setJavaScriptCanOpenWindowsAutomatically(false);
        ws.setAllowFileAccess(false);
        ws.setBuiltInZoomControls(true);
        ws.setDisplayZoomControls(false);

        final View[] customFullscreenView = new View[1];
        final WebChromeClient.CustomViewCallback[] customViewCallback = new WebChromeClient.CustomViewCallback[1];

        viewer.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
                int count = blockedCount.incrementAndGet();
                runOnUiThread(() -> shieldView.setText("Shield Active · " + count + " popups/ads blocked"));
                return false;
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customFullscreenView[0] != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customFullscreenView[0] = view;
                customViewCallback[0] = callback;
                toolbar.setVisibility(View.GONE);
                viewer.setVisibility(View.GONE);
                container.addView(view, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
                ));
            }

            @Override
            public void onHideCustomView() {
                if (customFullscreenView[0] == null) return;
                container.removeView(customFullscreenView[0]);
                customFullscreenView[0] = null;
                toolbar.setVisibility(View.VISIBLE);
                viewer.setVisibility(View.VISIBLE);
                if (customViewCallback[0] != null) {
                    customViewCallback[0].onCustomViewHidden();
                    customViewCallback[0] = null;
                }
            }
        });

        viewer.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null && isAdOrTrackerHost(uri.getHost())) {
                    int count = blockedCount.incrementAndGet();
                    runOnUiThread(() -> shieldView.setText("Shield Active · " + count + " popups/ads blocked"));
                    return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null) return true;
                String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.US) : "";
                if (!"https".equals(scheme) && !"http".equals(scheme)) {
                    int count = blockedCount.incrementAndGet();
                    runOnUiThread(() -> shieldView.setText("Shield Active · " + count + " redirects blocked"));
                    return true;
                }
                String host = uri.getHost();
                if (isAdOrTrackerHost(host)) {
                    int count = blockedCount.incrementAndGet();
                    runOnUiThread(() -> shieldView.setText("Shield Active · " + count + " popups/ads blocked"));
                    return true;
                }
                // Keep navigation on the target streaming/reading domain, allowed video embeds/CDNs, or Cloudflare/captcha challenges
                String targetDom = baseDomain(host);
                if (!targetDom.equals(initialDomain) && !initialDomain.isEmpty() && !isAllowedEmbedOrChallengeHost(host)) {
                    int count = blockedCount.incrementAndGet();
                    runOnUiThread(() -> shieldView.setText("Shield Active · Blocked external redirect (" + count + ")"));
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                String cosmeticCss =
                    "ins.adsbygoogle,[id*='ad-banner'],[id*='ad_banner'],[class*='popup-ad']," +
                    "[class*='ad-overlay'],[class*='interstitial'],[data-ad-slot]" +
                    "{display:none!important;visibility:hidden!important;pointer-events:none!important;}";
                String js =
                    "(function(){try{" +
                    "if(document.getElementById('lt-cosmetic-shield'))return;" +
                    "var s=document.createElement('style');s.id='lt-cosmetic-shield';" +
                    "s.textContent=" + JSONObject.quote(cosmeticCss) + ";" +
                    "(document.head||document.documentElement).appendChild(s);" +
                    "}catch(e){}})();";
                view.evaluateJavascript(js, null);
            }
        });

        container.addView(viewer, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ));
        root.addView(toolbar);
        root.addView(container);

        backBtn.setOnClickListener(v -> {
            if (viewer.canGoBack()) viewer.goBack();
            else dialog.dismiss();
        });
        reloadBtn.setOnClickListener(v -> viewer.reload());
        closeBtn.setOnClickListener(v -> dialog.dismiss());

        dialog.setContentView(root);
        dialog.setOnKeyListener((d, keyCode, event) -> {
            if (keyCode == android.view.KeyEvent.KEYCODE_BACK && event.getAction() == android.view.KeyEvent.ACTION_UP) {
                if (viewer.canGoBack()) {
                    viewer.goBack();
                    return true;
                }
                dialog.dismiss();
                return true;
            }
            return false;
        });
        dialog.setOnDismissListener(d -> {
            try {
                viewer.stopLoading();
                viewer.destroy();
            } catch (Exception ignored) {}
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        });

        viewer.loadUrl(initialUrl);
        dialog.show();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureIncomingIntent(intent);
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            flushPendingIntents(webView);
        }
    }

    private void captureIncomingIntent(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data == null) return;
        String scheme = data.getScheme();
        String host = data.getHost();
        if ("com.listtube.app".equals(scheme) && "tab".equals(host)) {
            String seg = data.getLastPathSegment();
            if (seg != null && !seg.isEmpty()) {
                pendingShortcutTab = seg;
            }
            return;
        }
        String tabQuery = data.getQueryParameter("tab");
        if (tabQuery != null && !tabQuery.isEmpty()) {
            pendingShortcutTab = tabQuery;
        }
        String urlStr = data.toString();
        if (urlStr.contains("code=") || urlStr.contains("access_token=")) {
            pendingOAuthUrl = urlStr;
        }
    }

    private void flushPendingIntents(WebView webView) {
        if (pendingShortcutTab != null) {
            final String targetTab = pendingShortcutTab;
            pendingShortcutTab = null;
            webView.postDelayed(() -> {
                String qTab = JSONObject.quote(targetTab);
                String js =
                    "window.__pendingListTubeTab = " + qTab + ";" +
                    "if (window.__listtubeOpenTab) { window.__listtubeOpenTab(" + qTab + "); }";
                webView.evaluateJavascript(js, null);
            }, 450);
        }
        if (pendingOAuthUrl == null) return;
        final String targetUrl = pendingOAuthUrl;
        pendingOAuthUrl = null;
        webView.postDelayed(() -> {
            String js = "window.__listtubeHandleOAuthUrl && window.__listtubeHandleOAuthUrl(" + JSONObject.quote(targetUrl) + ");";
            webView.evaluateJavascript(js, null);
        }, 500);
    }
}
