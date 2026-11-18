package com.listtube.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

public class AiringAlertReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "listtube_airing";
    public static final String EXTRA_ALERT_ID = "alert_id";
    public static final String EXTRA_TITLE = "alert_title";
    public static final String EXTRA_BODY = "alert_body";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        if (Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        String id = intent.getStringExtra(EXTRA_ALERT_ID);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        if (title == null || title.isEmpty()) title = "Episode Airing Soon";
        if (body == null || body.isEmpty()) body = "Check your ListTube airing schedule.";

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Episode Airing Alerts",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Upcoming episode alerts for shows on your watchlist");
            nm.createNotificationChannel(channel);
        }

        Intent openIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("com.listtube.app://tab/schedule"));
        openIntent.setClass(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            id != null ? id.hashCode() : 1001,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(context, CHANNEL_ID)
            : new Notification.Builder(context);

        builder
            .setSmallIcon(context.getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(contentIntent);

        try {
            nm.notify(id != null ? id.hashCode() : (int) System.currentTimeMillis(), builder.build());
        } catch (SecurityException ignored) {
            // Permission revoked between check and notify
        }
    }
}
