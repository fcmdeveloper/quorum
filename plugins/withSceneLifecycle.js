/**
 * iOS 27 exige el ciclo de vida con escenas (UIScene). La plantilla de Expo crea la ventana
 * en el AppDelegate; este plugin la mueve a un SceneDelegate y agrega el manifiesto al Info.plist.
 * Se aplica en cada `expo prebuild`, así el arreglo no se pierde.
 */
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const SCENE_DELEGATE = `
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: appDelegate.launchOptions)
    if let ctx = connectionOptions.urlContexts.first {
      _ = appDelegate.application(UIApplication.shared, open: ctx.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    for ctx in URLContexts {
      _ = appDelegate.application(UIApplication.shared, open: ctx.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

function patchAppDelegate(src) {
  if (src.includes('class SceneDelegate')) return src;
  let out = src.replace(
    /(var reactNativeFactory: RCTReactNativeFactory\?\n)/,
    '$1  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n',
  );
  out = out.replace(
    /#if os\(iOS\) \|\| os\(tvOS\)\s*\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*\n\s*factory\.startReactNative\([\s\S]*?launchOptions: launchOptions\)\s*\n#endif/,
    '    // La ventana la crea SceneDelegate (iOS 27).\n    self.launchOptions = launchOptions',
  );
  if (out === src || !out.includes('self.launchOptions = launchOptions')) {
    throw new Error('withSceneLifecycle: la plantilla de AppDelegate cambió; revisa el plugin.');
  }
  return out + SCENE_DELEGATE;
}

module.exports = function withSceneLifecycle(config) {
  config = withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') throw new Error('withSceneLifecycle: se esperaba AppDelegate.swift');
    c.modResults.contents = patchAppDelegate(c.modResults.contents);
    return c;
  });
  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: 'Default', UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate' },
        ],
      },
    };
    return c;
  });
  return config;
};

module.exports.patchAppDelegate = patchAppDelegate;
