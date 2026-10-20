/**
 * Xcode 27 (Swift 6.4) escribe en el .swiftinterface de ExpoModulesJSI los tipos de C++ con la sintaxis
 * nueva de selector de módulo: `extension __ObjC::expo.__ObjC::CppError`. El script de Expo que compila
 * ese xcframework borra esas extensiones buscando la forma antigua (`extension __ObjC.`), así que con
 * Swift 6.4 la deja y la compilación falla ("cannot find type '__ObjC::expo' in scope").
 *
 * Este plugin ajusta ese patrón para que acepte las dos formas. Se aplica en cada `expo prebuild`
 * (node_modules se reinstala con `npm ci`). Como el script forma parte del hash de caché de Expo,
 * el cambio obliga a recompilar el xcframework. Quitar cuando Expo lo arregle.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const OLD = "sed '/^extension __ObjC\\./,/^}/d;";
const NEW = "sed '/^extension __ObjC[.:]/,/^}/d;";

module.exports = function withSwift64InterfaceFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const file = path.join(cfg.modRequest.projectRoot, 'node_modules', 'expo-modules-jsi', 'apple', 'scripts', 'build-xcframework.sh');
      if (!fs.existsSync(file)) return cfg;
      const src = fs.readFileSync(file, 'utf8');
      if (src.includes(NEW)) return cfg;
      if (!src.includes(OLD)) {
        console.warn('withSwift64InterfaceFix: el script de ExpoModulesJSI cambió; revisa si el arreglo sigue haciendo falta.');
        return cfg;
      }
      fs.writeFileSync(file, src.replace(OLD, NEW));
      return cfg;
    },
  ]);
};
