package com.listtube.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private boolean bridgeConfigured = false;
    private String pendingOAuthUrl = null;

    @SuppressLint("SourceLockedOrientationActivity")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        super.onCreate(savedInstanceState);
        captureOAuthIntent(getIntent());

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
            }, "ListTubeNative");
            bridgeConfigured = true;
        }

        flushPendingOAuthUrl(webView);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureOAuthIntent(intent);
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            flushPendingOAuthUrl(webView);
        }
    }

    private void captureOAuthIntent(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data == null) return;
        String urlStr = data.toString();
        if (urlStr.contains("code=") || urlStr.contains("access_token=")) {
            pendingOAuthUrl = urlStr;
        }
    }

    private void flushPendingOAuthUrl(WebView webView) {
        if (pendingOAuthUrl == null) return;
        final String targetUrl = pendingOAuthUrl;
        pendingOAuthUrl = null;
        webView.postDelayed(() -> {
            String js = "window.__listtubeHandleOAuthUrl && window.__listtubeHandleOAuthUrl(" + JSONObject.quote(targetUrl) + ");";
            webView.evaluateJavascript(js, null);
        }, 500);
    }
}
