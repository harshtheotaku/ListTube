#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-/opt/homebrew/share/android-commandlinetools}"
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export PATH="$ANDROID_SDK_ROOT/emulator:$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$PATH"

AVD_NAME="ListTube_Pixel"
SYS_IMG="system-images;android-35;google_apis_playstore;arm64-v8a"
EMULATOR_BIN="$ANDROID_SDK_ROOT/emulator/emulator"

if [ ! -x "$EMULATOR_BIN" ]; then
  echo "Installing official Android Emulator..."
  yes | sdkmanager --licenses >/dev/null 2>&1 || true
  sdkmanager --install "emulator" "$SYS_IMG"
fi

if ! "$EMULATOR_BIN" -list-avds | grep -qx "$AVD_NAME"; then
  echo "Creating virtual Pixel phone ($AVD_NAME)..."
  echo "no" | avdmanager create avd --force -n "$AVD_NAME" -k "$SYS_IMG" -d "pixel_8"
fi

AVD_CFG="$HOME/.android/avd/${AVD_NAME}.avd/config.ini"
if [ -f "$AVD_CFG" ]; then
  sed -i '' 's/^hw.gpu.enabled=.*/hw.gpu.enabled=yes/' "$AVD_CFG" || true
  sed -i '' 's/^hw.gpu.mode=.*/hw.gpu.mode=host/' "$AVD_CFG" || true
  sed -i '' 's/^hw.keyboard=.*/hw.keyboard=yes/' "$AVD_CFG" || true
  sed -i '' 's/^hw.ramSize=.*/hw.ramSize=3072/' "$AVD_CFG" || true
fi

# Start virtual phone window if not already running
if ! adb devices | grep -q "emulator-"; then
  echo "Booting virtual Pixel Android phone window..."
  nohup "$EMULATOR_BIN" -avd "$AVD_NAME" -gpu host -no-snapshot-save >/tmp/listtube-emulator.log 2>&1 &
fi

echo "Waiting for Android phone to finish booting..."
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
  sleep 2
done

echo "Building latest ListTube app and installing onto virtual Android phone..."
npm run build
npx cap sync android
(cd android && ./gradlew assembleDebug -q)

adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.listtube.app/.MainActivity >/dev/null 2>&1 || \
  adb shell monkey -p com.listtube.app -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1

echo ""
echo "ListTube is now live inside your virtual Android phone!"
