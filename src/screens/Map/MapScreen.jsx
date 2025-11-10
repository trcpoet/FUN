useEffect(() => {
  let isMounted = true;

  (async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    const loc = await Location.getCurrentPositionAsync({});
    if (isMounted) {
      setLocation(loc.coords);
    }
  })();

  return () => {
    isMounted = false;
  };
}, []);
