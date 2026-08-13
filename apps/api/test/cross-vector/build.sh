#!/usr/bin/env bash
# Compile le harnais du vecteur croisé : le VRAI SegmentedBlobReader du lecteur
# mobile (Spike-B) + CrossVector.kt → un jar JVM. Toolchain Kotlin/JVM requise
# (dépôt mobile + compilateur Kotlin) ; chemins surchargeables par variables.
#
#   JDK_HOME       JDK (défaut ~/mobiletools/jdk)
#   KOTLIN_LIB     dossier des jars du compilateur Kotlin (défaut gradle-8.9/lib)
#   SPIKE_READER   SegmentedBlobReader.kt du lecteur mobile (défaut ~/spike-gafeso/...)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JDK="${JDK_HOME:-$HOME/mobiletools/jdk}"
KC="${KOTLIN_LIB:-$HOME/mobiletools/gradle-8.9/lib}"
SPIKE_READER="${SPIKE_READER:-$HOME/spike-gafeso/android-b1/app/src/main/java/com/gafeso/spikeb/SegmentedBlobReader.kt}"
OUT="$HERE/build"
mkdir -p "$OUT"

# org.json (utilisé par SegmentedBlobReader) — intégré à Android, jar sur JVM.
[ -f "$OUT/json.jar" ] || curl -sL -o "$OUT/json.jar" \
  https://repo1.maven.org/maven2/org/json/json/20240303/json-20240303.jar

STDLIB="$(ls "$KC"/kotlin-stdlib-*.jar | head -1)"
"$JDK/bin/java" -cp "$KC/*" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler \
  -cp "$OUT/json.jar:$STDLIB" -d "$OUT/xvec.jar" \
  "$SPIKE_READER" "$HERE/CrossVector.kt"

echo "OK $OUT/xvec.jar"
