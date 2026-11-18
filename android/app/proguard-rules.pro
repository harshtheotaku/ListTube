# Capacitor & WebView JavascriptInterface keep rules for R8 shrinking
-keepclassmembers class com.listtube.app.MainActivity* {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.listtube.app.AiringAlertReceiver { *; }

-keepattributes *Annotation*,JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

-keep public class * extends com.getcapacitor.Plugin {
    public <methods>;
}
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
}
